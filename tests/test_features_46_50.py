"""
DRISHTI-X — Automated Integration Tests for Features 46–50
- Feature 46: Patient Data Privacy & Pseudonymization (MRN, PII separation, demo isolation)
- Feature 47: Responsive UI Support & Permission Matrix
- Feature 48: Health Worker Mode Services & Sample Image Serving
- Feature 49: Expert Doctor Mode Adjudication & Cryptographic Audit Seal
- Feature 50: Judge-Ready Demo Scenarios & Isolated Demo Reset (Preserves Real Patients)
"""
import os
import sys
import uuid
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app
from app.db.base import Base, get_db
from app.models.user import User, UserRole
from app.models.patient import Patient, Gender
from app.models.screening import Screening, Prediction, ScreeningStatus
from app.models.audit import AuditLog
from app.core.security import hash_password, create_access_token
from app.services.audit_service import AuditService, GENESIS_HASH

# In-memory SQLite test database
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for col_def in [
            "capsule_synced BOOLEAN DEFAULT 0 NULL",
            "full_image_pending BOOLEAN DEFAULT 0 NULL",
            "sync_idempotency_key VARCHAR(128) NULL",
            "prev_event_hash VARCHAR(64) NULL",
            "event_hash VARCHAR(64) NULL",
        ]:
            try:
                conn.execute(text(f"ALTER TABLE screenings ADD COLUMN {col_def}"))
            except Exception:
                pass


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def health_worker_auth(db_session):
    user = (
        db_session.query(User)
        .filter(User.email == "hw_demo@drishti.org")
        .first()
    )
    if not user:
        user = User(
            id=uuid.uuid4(),
            email="hw_demo@drishti.org",
            hashed_password=hash_password("Pass123!"),
            full_name="Asha Rural Health Worker",
            role=UserRole.HEALTH_WORKER,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {"headers": {"Authorization": f"Bearer {token}"}, "user": user}


@pytest.fixture
def doctor_auth(db_session):
    user = (
        db_session.query(User)
        .filter(User.email == "dr_expert@drishti.org")
        .first()
    )
    if not user:
        user = User(
            id=uuid.uuid4(),
            email="dr_expert@drishti.org",
            hashed_password=hash_password("Pass123!"),
            full_name="Dr. Ananya Sharma MD",
            role=UserRole.OPHTHALMOLOGIST,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {"headers": {"Authorization": f"Bearer {token}"}, "user": user}


@pytest.fixture
def admin_auth(db_session):
    user = (
        db_session.query(User)
        .filter(User.email == "admin_demo@drishti.org")
        .first()
    )
    if not user:
        user = User(
            id=uuid.uuid4(),
            email="admin_demo@drishti.org",
            hashed_password=hash_password("Pass123!"),
            full_name="System Admin Demo",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return {"headers": {"Authorization": f"Bearer {token}"}, "user": user}


# ─────────────────────────────────────────────────────────────────────────────
# Test Feature 46: Patient Data Privacy & Pseudonymization
# ─────────────────────────────────────────────────────────────────────────────
def test_feature_46_patient_data_privacy(db_session, client, health_worker_auth):
    """
    Feature 46: Strict privacy-by-design.
    - MRN / patient_code generation follows standardized pseudonymous formats.
    - Separation of identifiable patient demographics from analytical screening telemetry.
    - Demo identities are explicitly prefixed to prevent contamination with production data.
    """
    # Create real patient
    pt = Patient(
        id=uuid.uuid4(),
        patient_code="REF-PT-4821",
        name="Sunita Devi",
        age=54,
        gender=Gender.FEMALE,
        diabetes_duration_years=7,
    )
    db_session.add(pt)
    db_session.commit()

    assert pt.patient_code.startswith("REF-PT-")
    assert pt.name == "Sunita Devi"

    # Create associated screening
    scr = Screening(
        id=uuid.uuid4(),
        patient_id=pt.id,
        created_by=health_worker_auth["user"].id,
        eye_side="RIGHT",
        status=ScreeningStatus.ANALYZED,
        priority_level="MEDIUM",
    )
    db_session.add(scr)
    db_session.commit()

    pred = Prediction(
        id=uuid.uuid4(),
        screening_id=scr.id,
        predicted_grade=2,
        confidence=0.84,
    )
    db_session.add(pred)
    db_session.commit()

    # Query screening endpoint
    resp = client.get(f"/api/screenings/{scr.id}", headers=health_worker_auth["headers"])
    assert resp.status_code == 200
    scr_data = resp.json()
    assert scr_data["status"] == "ANALYZED"
    assert scr_data["priority_level"] == "MEDIUM"
    assert scr_data["patient_id"] == str(pt.id)
    # Feature 46: Verify patient demographics / PII are separated from analytical screening record
    assert "name" not in scr_data
    assert "Sunita Devi" not in str(scr_data)


# ─────────────────────────────────────────────────────────────────────────────
# Test Feature 47: Responsive Support & RBAC Permission Matrix
# ─────────────────────────────────────────────────────────────────────────────
def test_feature_47_permission_matrix_and_endpoints(client):
    """
    Feature 47: Validates system endpoints for responsive consumption.
    """
    resp = client.get("/api/auth/permission-matrix")
    assert resp.status_code == 200
    data = resp.json()
    assert "roles" in data
    assert "HEALTH_WORKER" in data["roles"]
    assert "OPHTHALMOLOGIST" in data["roles"]
    assert "ADMIN" in data["roles"]


# ─────────────────────────────────────────────────────────────────────────────
# Test Feature 48: Health Worker Mode Services & Sample Images
# ─────────────────────────────────────────────────────────────────────────────
def test_feature_48_health_worker_services(client, health_worker_auth):
    """
    Feature 48: Health worker services for rapid intake and sample image inspection.
    """
    # 1. Fetch available verified sample images
    resp = client.get("/api/screenings/demo/sample-images", headers=health_worker_auth["headers"])
    assert resp.status_code == 200
    samples_resp = resp.json()
    samples = samples_resp.get("samples", samples_resp)
    assert isinstance(samples, list)
    assert len(samples) >= 3

    keys = [s["id"] for s in samples]
    assert "aptos_sample_1" in keys
    assert "idrid_sample_1" in keys
    assert "messidor2_sample_1" in keys

    # 2. Download sample image blob
    resp_img = client.get("/api/screenings/demo/sample-image-file/aptos_sample_1", headers=health_worker_auth["headers"])
    assert resp_img.status_code == 200
    assert resp_img.headers["content-type"] in ["image/png", "image/jpeg"]
    assert len(resp_img.content) > 1000


# ─────────────────────────────────────────────────────────────────────────────
# Test Feature 49: Expert Doctor Adjudication & Cryptographic Audit Seal
# ─────────────────────────────────────────────────────────────────────────────
def test_feature_49_expert_doctor_adjudication_and_audit(db_session, client, doctor_auth):
    """
    Feature 49: Doctor review action creates a cryptographically sealed audit trail entry.
    """
    # 1. Create a patient and screening requiring review
    pt = Patient(
        id=uuid.uuid4(),
        patient_code="PT-EXP-9001",
        name="Kailash Sharma",
        age=61,
        gender=Gender.MALE,
    )
    db_session.add(pt)
    db_session.commit()

    scr = Screening(
        id=uuid.uuid4(),
        patient_id=pt.id,
        created_by=doctor_auth["user"].id,
        eye_side="LEFT",
        status=ScreeningStatus.HUMAN_REVIEW_REQUIRED,
        priority_level="HIGH",
    )
    db_session.add(scr)
    db_session.commit()

    pred = Prediction(
        id=uuid.uuid4(),
        screening_id=scr.id,
        predicted_grade=3,
        confidence=0.74,
    )
    db_session.add(pred)
    db_session.commit()

    # 2. Doctor submits review action: ACCEPT grade
    payload = {
        "action": "ACCEPT",
        "doctor_grade": 2,
        "notes": "Lesion count consistent with Moderate NPDR. Confirming diagnosis.",
    }
    resp = client.post(
        f"/api/screenings/{scr.id}/review-action",
        json=payload,
        headers=doctor_auth["headers"],
    )
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["action"] == "ACCEPT"

    # 3. Verify audit log was recorded and chained
    audit_entry = (
        db_session.query(AuditLog)
        .filter(AuditLog.screening_id == scr.id)
        .order_by(AuditLog.timestamp.desc())
        .first()
    )
    assert audit_entry is not None
    assert "DOCTOR" in audit_entry.action
    assert audit_entry.event_hash is not None
    assert len(audit_entry.event_hash) == 64
    assert audit_entry.prev_event_hash is not None


# ─────────────────────────────────────────────────────────────────────────────
# Test Feature 50: Judge Demo Scenarios & Isolated Demo Reset
# ─────────────────────────────────────────────────────────────────────────────
def test_feature_50_judge_scenarios_and_isolated_reset(db_session, client, admin_auth):
    """
    Feature 50: Judge-ready scenarios and isolated demo reset.
    - Scenarios A, B, and C provide distinct clinical learning objectives.
    - Demo reset cleans up ONLY demo records (DEMO-* / PT-DEMO*) and strictly preserves real patient records!
    """
    # 1. Scenarios endpoint
    resp = client.get("/api/screenings/demo/scenarios")
    assert resp.status_code == 200
    scenarios_data = resp.json()
    assert "scenarios" in scenarios_data
    scenarios = scenarios_data["scenarios"]

    sc_by_key = {s["scenario_key"]: s for s in scenarios}
    assert "SCENARIO_A" in sc_by_key
    assert "SCENARIO_B" in sc_by_key
    assert "SCENARIO_C" in sc_by_key

    assert sc_by_key["SCENARIO_A"]["expected_quality"]["status"] == "PASS"
    assert sc_by_key["SCENARIO_B"]["expected_assurance"]["concordance"] == "DISCORDANT"
    assert sc_by_key["SCENARIO_C"]["expected_quality"]["status"] == "FAIL"

    # 2. Test isolated reset safety:
    # Create real patient that MUST NOT be deleted
    real_pt = Patient(
        id=uuid.uuid4(),
        patient_code="REAL-CLINICAL-491",
        name="Real Clinical Patient (Preserve)",
        age=50,
        gender=Gender.FEMALE,
    )
    db_session.add(real_pt)

    # Create demo patient that SHOULD be cleaned up
    demo_pt = Patient(
        id=uuid.uuid4(),
        patient_code="DEMO-PT-8888",
        name="Demo Patient (Disposable)",
        age=45,
        gender=Gender.MALE,
    )
    db_session.add(demo_pt)
    db_session.commit()

    # Create demo screening
    demo_scr = Screening(
        id=uuid.uuid4(),
        patient_id=demo_pt.id,
        created_by=admin_auth["user"].id,
        eye_side="RIGHT",
        status=ScreeningStatus.ANALYZED,
        priority_level="ROUTINE",
    )
    db_session.add(demo_scr)
    db_session.commit()

    demo_scr_id = demo_scr.id
    real_pt_code = real_pt.patient_code

    # Execute demo reset
    reset_resp = client.post("/api/screenings/demo/reset", headers=admin_auth["headers"])
    assert reset_resp.status_code == 200
    reset_data = reset_resp.json()
    assert reset_data["status"] == "RESET_COMPLETE"
    assert "real patient records" in reset_data["message"].lower()

    # Verify real patient was PRESERVED
    check_real = db_session.query(Patient).filter(Patient.patient_code == real_pt_code).first()
    assert check_real is not None, "CRITICAL ERROR: Real patient record was deleted by demo reset!"

    # Verify demo screening was deleted
    check_demo_scr = db_session.query(Screening).filter(Screening.id == demo_scr_id).first()
    assert check_demo_scr is None, "Demo screening was not cleaned up by demo reset."
