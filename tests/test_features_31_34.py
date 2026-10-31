"""
DRISHTI-X — Integration Tests for Features 31–34
Tests:
- Low-bandwidth offline persistence & Evidence Capsule schema
- Idempotency & priority-aware scheduling
- Checksum verification for full-resolution fundus images
- Resumable chunked image assembly
"""
import pytest
import io
import os
import sys
import uuid
import hashlib
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app
from app.db.base import Base, engine, get_db
from app.models.user import User, UserRole
from app.core.security import create_access_token
from ai.assurance.evidence_capsule_service import EvidenceCapsuleService
from app.services.priority_sync_service import PrioritySyncService


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from sqlalchemy import text
    with engine.begin() as conn:
        for col in ["capsule_synced", "full_image_pending", "sync_idempotency_key"]:
            try:
                conn.execute(text(f"ALTER TABLE screenings ADD COLUMN {col} VARCHAR(128) NULL"))
            except Exception:
                pass
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = next(get_db())
    yield db
    db.close()


@pytest.fixture
def auth_headers(db_session):
    hw = db_session.query(User).filter(User.email == "hw_test_rural@drishti.ai").first()
    if not hw:
        hw = User(
            id=uuid.uuid4(),
            email="hw_test_rural@drishti.ai",
            hashed_password="pw",
            full_name="Rural Health Worker",
            role=UserRole.HEALTH_WORKER,
            is_active=True,
        )
        db_session.add(hw)

    doctor = db_session.query(User).filter(User.email == "doc_test_rural@drishti.ai").first()
    if not doctor:
        doctor = User(
            id=uuid.uuid4(),
            email="doc_test_rural@drishti.ai",
            hashed_password="pw",
            full_name="Rural Specialist Doctor",
            role=UserRole.OPHTHALMOLOGIST,
            is_active=True,
        )
        db_session.add(doctor)

    db_session.commit()
    db_session.refresh(hw)
    db_session.refresh(doctor)

    hw_token = create_access_token({"sub": str(hw.id), "role": hw.role.value})
    doc_token = create_access_token({"sub": str(doctor.id), "role": doctor.role.value})

    return {
        "health_worker": {"Authorization": f"Bearer {hw_token}"},
        "doctor": {"Authorization": f"Bearer {doc_token}"},
        "hw_user": hw,
        "doctor_user": doctor,
    }


def test_evidence_capsule_generation_and_validation():
    dummy_img = io.BytesIO()
    Image.new("RGB", (100, 100), color=(128, 64, 32)).save(dummy_img, format="JPEG")
    img_bytes = dummy_img.getvalue()

    capsule = EvidenceCapsuleService.build_capsule(
        case_id="case-123",
        case_number="DX-CASE-202610-TEST01",
        patient_id="pat-456",
        patient_code="PT-001",
        facility_code="PHC-TEST-01",
        prediction=None, # Not analyzed yet
        image_bytes=img_bytes,
        priority_info={"priority_level": "CRITICAL", "priority_score": 85.0},
    )

    assert capsule["capsule_version"] == "1.0.0"
    assert capsule["predicted_grade"] is None
    assert capsule["grade_label"] == "AI_ANALYSIS_PENDING"
    assert capsule["confidence"] is None
    assert capsule["assurance_decision"] == "AI_ANALYSIS_PENDING"
    assert capsule["priority_level"] == "CRITICAL"
    assert capsule["priority_score"] == 85.0
    assert len(capsule["image_checksum"]) == 64
    assert capsule["thumbnail_preview"] is not None

    is_valid, err = EvidenceCapsuleService.validate_capsule(capsule)
    assert is_valid is True
    assert err is None


def test_transport_priority_calculation_and_aging():
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    t_new = now
    t_old = now - timedelta(minutes=40)

    p_crit = PrioritySyncService.calculate_transport_priority("CRITICAL", 85.0, t_new, now)
    p_rout = PrioritySyncService.calculate_transport_priority("ROUTINE", 10.0, t_new, now)
    p_rout_aged = PrioritySyncService.calculate_transport_priority("ROUTINE", 10.0, t_old, now)

    assert p_crit > p_rout
    assert p_rout_aged > p_rout
    assert p_rout_aged >= p_rout + 15.0


def test_evidence_capsule_ingestion_and_idempotency(client, auth_headers):
    checksum = hashlib.sha256(b"dummy_test_image_bytes_capsule").hexdigest()
    capsule_payload = {
        "capsule_version": "1.0.0",
        "case_number": "DX-CASE-202610-CAP001",
        "patient_ref_id": "REF-PT-CAPSULE01",
        "facility_code": "PHC-RURAL-TEST",
        "ai_engine": "EfficientNet-B0 + U-Net",
        "model_version": "1.0.0",
        "predicted_grade": 2,
        "grade_label": "Moderate NPDR",
        "confidence": 0.88,
        "calibration_status": "CALIBRATED",
        "image_quality_status": "GRADABLE",
        "assurance_decision": "VALIDATED",
        "priority_level": "HIGH",
        "priority_score": 62.0,
        "priority_reason": "Moderate NPDR with high confidence",
        "image_checksum": checksum,
        "idempotency_key": "idemp-test-cap-001",
    }

    # 1. Ingest capsule
    res = client.post("/api/screenings/capsule", json=capsule_payload, headers=auth_headers["health_worker"])
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["capsule_synced"] is True
    assert data["full_image_pending"] is True
    assert data["priority_level"] == "HIGH"
    screening_id = data["screening_id"]

    # 2. Idempotent re-send with same idempotency key must succeed and return existing
    res2 = client.post("/api/screenings/capsule", json=capsule_payload, headers=auth_headers["health_worker"])
    assert res2.status_code == 200
    assert res2.json()["screening_id"] == screening_id
    assert "already synchronized" in res2.json()["message"]


def test_full_image_sync_and_checksum_verification(client, auth_headers):
    img_buf = io.BytesIO()
    Image.new("RGB", (120, 120), color=(200, 100, 50)).save(img_buf, format="JPEG")
    img_bytes = img_buf.getvalue()
    checksum = hashlib.sha256(img_bytes).hexdigest()

    cap_res = client.post("/api/screenings/capsule", json={
        "capsule_version": "1.0.0",
        "case_number": "DX-CASE-202610-FULL01",
        "patient_ref_id": "REF-PT-FULL01",
        "facility_code": "PHC-RURAL-TEST",
        "image_checksum": checksum,
        "priority_level": "MEDIUM",
        "priority_score": 35.0,
        "idempotency_key": "idemp-full-img-test",
    }, headers=auth_headers["health_worker"])
    assert cap_res.status_code == 200
    scr_id = cap_res.json()["screening_id"]

    # 1. Corrupted checksum upload fails
    bad_res = client.post(
        f"/api/screenings/{scr_id}/full-image",
        files={"file": ("corrupt.jpg", b"corrupted_bytes_that_do_not_match", "image/jpeg")},
        headers=auth_headers["health_worker"],
    )
    assert bad_res.status_code == 400
    assert "checksum mismatch" in bad_res.json()["detail"]

    # 2. Upload matching checksum succeeds
    good_res = client.post(
        f"/api/screenings/{scr_id}/full-image",
        files={"file": ("fundus.jpg", img_bytes, "image/jpeg")},
        headers=auth_headers["health_worker"],
    )
    assert good_res.status_code == 200
    assert good_res.json()["checksum_verified"] is True
    assert good_res.json()["status"] == "FULL_IMAGE_SYNCED"


def test_chunked_upload_and_assembly(client, auth_headers):
    img_buf = io.BytesIO()
    Image.new("RGB", (150, 150), color=(10, 80, 160)).save(img_buf, format="JPEG")
    img_bytes = img_buf.getvalue()
    checksum = hashlib.sha256(img_bytes).hexdigest()

    cap_res = client.post("/api/screenings/capsule", json={
        "capsule_version": "1.0.0",
        "case_number": "DX-CASE-202610-CHUNK01",
        "patient_ref_id": "REF-PT-CHUNK01",
        "facility_code": "PHC-RURAL-TEST",
        "image_checksum": checksum,
        "priority_level": "ROUTINE",
        "priority_score": 15.0,
        "idempotency_key": "idemp-chunk-test-01",
    }, headers=auth_headers["health_worker"])
    assert cap_res.status_code == 200
    scr_id = cap_res.json()["screening_id"]

    # Split into 2 chunks
    mid = len(img_bytes) // 2
    c0 = img_bytes[:mid]
    c1 = img_bytes[mid:]

    # Upload chunk 0
    res0 = client.post(
        f"/api/screenings/{scr_id}/upload-chunk",
        params={"chunk_index": 0, "total_chunks": 2},
        files={"file": ("c0.part", c0, "application/octet-stream")},
        headers=auth_headers["health_worker"],
    )
    assert res0.status_code == 200
    assert res0.json()["is_complete"] is False

    # Upload chunk 1 (final)
    res1 = client.post(
        f"/api/screenings/{scr_id}/upload-chunk",
        params={"chunk_index": 1, "total_chunks": 2},
        files={"file": ("c1.part", c1, "application/octet-stream")},
        headers=auth_headers["health_worker"],
    )
    assert res1.status_code == 200
    assert res1.json()["is_complete"] is True
    assert res1.json()["checksum_verified"] is True


def test_priority_batch_sync_and_queue(client, auth_headers):
    rand_suffix = uuid.uuid4().hex[:8]
    batch_payload = {
        "client_id": "rural-tablet-01",
        "facility_code": "PHC-RAMNAGAR",
        "capsules": [
            {
                "capsule_version": "1.0.0",
                "case_number": f"DX-CASE-BATCH-ROUTINE-{rand_suffix}",
                "patient_ref_id": f"REF-ROUTINE-{rand_suffix}",
                "facility_code": "PHC-RAMNAGAR",
                "priority_level": "ROUTINE",
                "priority_score": 10.0,
                "image_checksum": hashlib.sha256(b"routine").hexdigest(),
                "idempotency_key": f"batch-routine-key-{rand_suffix}",
            },
            {
                "capsule_version": "1.0.0",
                "case_number": f"DX-CASE-BATCH-CRITICAL-{rand_suffix}",
                "patient_ref_id": f"REF-CRITICAL-{rand_suffix}",
                "facility_code": "PHC-RAMNAGAR",
                "priority_level": "CRITICAL",
                "priority_score": 90.0,
                "image_checksum": hashlib.sha256(b"critical").hexdigest(),
                "idempotency_key": f"batch-critical-key-{rand_suffix}",
            },
        ],
    }

    res = client.post("/api/screenings/sync/priority-batch", json=batch_payload, headers=auth_headers["health_worker"])
    assert res.status_code == 200
    data = res.json()
    print("\nDEBUG BATCH RESULTS:", data["results"])
    assert data["total_received"] == 2
    assert data["capsules_synced"] == 2

    # Query the sync queue to confirm priority order
    queue_res = client.get("/api/screenings/sync/queue", headers=auth_headers["doctor"])
    assert queue_res.status_code == 200
    queue = queue_res.json()
    assert len(queue) >= 2
    assert queue[0]["transport_priority"] >= queue[-1]["transport_priority"]

    # History endpoint
    hist_res = client.get("/api/screenings/sync/history", headers=auth_headers["doctor"])
    assert hist_res.status_code == 200
    assert len(hist_res.json()) >= 1
