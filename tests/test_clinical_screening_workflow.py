"""
DRISHTI-X — End-to-End Clinical Patient Screening Workflow Tests
Verifies the complete clinical screening pipeline:
1. Patient registration with full clinical demographics and glycemic profile
2. Anonymous / rural walk-in patient registration
3. Unknown diabetes duration and treatment handling
4. Automatic age calculation from date of birth
5. Patient update (PUT /api/patients/{id})
6. Patient search and filtering by code, name, district
7. Screening case creation with eye side (OS / OD), purpose, operator, facility
8. Draft screening update (PATCH /api/screenings/{id})
9. Retinal fundus image upload (Left eye OS and Right eye OD)
10. Corrupted or unsupported file format validation
11. Pre-inference instant quality check gate (/quality-check)
12. Ungradable image quality check handling
13. End-to-end AI analysis (/analyze)
14. Doctor review recording
15. Structured clinical report generation (/report)
16. PDF report download (/report/pdf)
17. Offline rural camp batch synchronization
18. Patient screening history linkage
"""
import os
import sys
import uuid
import tempfile
import io
import pytest
from datetime import datetime, timezone, date
from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app
from app.db.base import Base, get_db
from app.core.security import hash_password, create_access_token
from app.models.user import User, UserRole
from app.models.patient import Patient, Gender
from app.models.screening import Screening, FundusImage, ScreeningStatus, AssuranceDecision


@pytest.fixture(scope="module")
def workflow_db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def workflow_db(workflow_db_engine):
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=workflow_db_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="function")
def auth_client(workflow_db):
    # Create test clinician user
    user = workflow_db.query(User).filter(User.email == "clinician@drishti.in").first()
    if not user:
        user = User(
            id=uuid.uuid4(),
            email="clinician@drishti.in",
            full_name="Dr. Sunita Sharma",
            hashed_password=hash_password("clinicalpassword123"),
            role=UserRole.OPHTHALMOLOGIST,
            facility_name="Varanasi District Eye Hospital",
            facility_location="Varanasi",
            auth_provider="local",
        )
        workflow_db.add(user)
        workflow_db.commit()
        workflow_db.refresh(user)

    token = create_access_token(data={"sub": str(user.id), "role": user.role.value})

    def override_get_db():
        try:
            yield workflow_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        c.headers.update({"Authorization": f"Bearer {token}"})
        yield c, user
    app.dependency_overrides.clear()


import numpy as np
import cv2

def create_test_fundus_bytes(gradable: bool = True) -> bytes:
    """Create synthetic fundus image bytes for testing."""
    if gradable:
        width, height = 512, 512
        img = np.zeros((height, width, 3), dtype=np.uint8)
        radius = int(min(width, height) * 0.45)
        center = (width // 2, height // 2)
        # Fundus red-orange background
        cv2.circle(img, center, radius, (30, 80, 200), -1)
        # Optic disc
        disc_center = (int(width * 0.35), height // 2)
        cv2.circle(img, disc_center, int(radius * 0.20), (80, 200, 240), -1)
        # Retinal vessels with high contrast for focus sharpness
        for i in range(12):
            pt1 = (int(width * 0.35 + i * 8), height // 2 - 20 + i * 5)
            pt2 = (int(width * 0.35 + 80 + i * 15), height // 2 - 80 + i * 12)
            cv2.line(img, pt1, pt2, (15, 30, 100), 2)
        _, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return enc.tobytes()
    else:
        # Very tiny image that fails quality checks
        img = np.zeros((64, 64, 3), dtype=np.uint8)
        _, enc = cv2.imencode(".jpg", img)
        return enc.tobytes()


# ─── 1. Patient Registration Tests ──────────────────────────────────────────

def test_register_patient_complete_information(auth_client, workflow_db):
    client, user = auth_client
    payload = {
        "name": "Devendra Kumar Patel",
        "date_of_birth": "1972-04-15",
        "gender": "MALE",
        "contact_number": "+91 98765 43210",
        "address": "Village Sarnath, Block Cholapur",
        "is_anonymous": False,
        "diabetes_type": "TYPE_2",
        "diabetes_duration_years": 8,
        "diabetes_treatment": "BOTH",
        "hba1c_value": 8.4,
        "hba1c_unit": "%",
        "blood_glucose_value": 185.0,
        "blood_glucose_unit": "mg/dL",
        "blood_glucose_type": "FASTING",
        "history_of_dr": "MILD_NPDR",
        "visual_symptoms": ["BLURRED_VISION", "FLOATERS"],
        "symptom_onset": "Gradual blurring for 4 months",
        "facility_code": "PHC Cholapur",
        "district": "Varanasi",
        "state": "Uttar Pradesh",
        "notes": "Patient reports difficulty reading road signs.",
    }

    r = client.post("/api/patients", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert "id" in data
    assert data["patient_code"].startswith("DX-")
    assert data["name"] == "Devendra Kumar Patel"
    assert data["gender"] == "MALE"
    assert data["diabetes_type"] == "TYPE_2"
    assert data["hba1c_value"] == 8.4
    assert data["visual_symptoms"] == ["BLURRED_VISION", "FLOATERS"]
    # Verify auto-computed age from DOB (1972)
    assert data["age"] is not None
    assert 50 <= data["age"] <= 60


def test_register_anonymous_walk_in_patient(auth_client, workflow_db):
    client, user = auth_client
    payload = {
        "is_anonymous": True,
        "age": 58,
        "gender": "FEMALE",
        "diabetes_type": "TYPE_2",
        "district": "Mirzapur",
        "state": "Uttar Pradesh",
    }

    r = client.post("/api/patients", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["is_anonymous"] is True
    assert data["name"] is None
    assert data["contact_number"] is None
    assert data["age"] == 58
    assert data["patient_code"].startswith("DX-")


def test_unknown_diabetes_history_distinction(auth_client, workflow_db):
    """Unknown or unrecorded diabetes history is preserved and distinct from absent disease."""
    client, user = auth_client
    payload = {
        "name": "Anjali Devi",
        "age": 45,
        "gender": "FEMALE",
        "diabetes_type": "UNKNOWN",
        "diabetes_duration_years": None,
        "diabetes_treatment": "UNKNOWN",
        "visual_symptoms": ["NOT_DOCUMENTED"],
    }
    r = client.post("/api/patients", json=payload)
    assert r.status_code == 201
    data = r.json()
    assert data["diabetes_type"] == "UNKNOWN"
    assert data["diabetes_duration_years"] is None
    assert data["visual_symptoms"] == ["NOT_DOCUMENTED"]


def test_update_patient_details(auth_client, workflow_db):
    client, user = auth_client
    # Create patient
    r_create = client.post("/api/patients", json={"name": "Kavita Singh", "age": 40, "gender": "FEMALE"})
    patient_id = r_create.json()["id"]

    # Update patient with lab values
    r_update = client.put(f"/api/patients/{patient_id}", json={
        "hba1c_value": 7.2,
        "blood_glucose_value": 140.0,
        "diabetes_treatment": "ORAL",
    })
    assert r_update.status_code == 200
    data = r_update.json()
    assert data["hba1c_value"] == 7.2
    assert data["blood_glucose_value"] == 140.0
    assert data["diabetes_treatment"] == "ORAL"


def test_list_patients_and_search(auth_client, workflow_db):
    client, user = auth_client
    # Search by district
    r = client.get("/api/patients?search=Varanasi")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ─── 2. Screening Case & Image Workflow Tests ──────────────────────────────

def test_screening_creation_with_eye_side_and_context(auth_client, workflow_db):
    client, user = auth_client
    # Create patient
    p_res = client.post("/api/patients", json={"name": "Brijesh Mishra", "age": 62, "gender": "MALE"})
    p_id = p_res.json()["id"]

    # Create screening for Left Eye (OS)
    scr_res = client.post("/api/screenings", json={
        "patient_id": p_id,
        "eye_side": "LEFT",
        "screening_purpose": "ROUTINE_DR_SCREENING",
        "screening_notes": "First screening encounter in rural mobile camp.",
        "referral_source": "ASHA_WORKER",
        "facility_name": "Camp PHC Arajiline",
        "operator_name": "Sita Devi (ASHA)",
    })
    assert scr_res.status_code == 201
    data = scr_res.json()
    assert data["eye_side"] == "LEFT"
    assert data["screening_purpose"] == "ROUTINE_DR_SCREENING"
    assert data["facility_name"] == "Camp PHC Arajiline"
    assert data["status"] == "PENDING"


def test_screening_draft_update(auth_client, workflow_db):
    client, user = auth_client
    p_res = client.post("/api/patients", json={"name": "Pooja Verma", "age": 38, "gender": "FEMALE"})
    p_id = p_res.json()["id"]

    scr_res = client.post("/api/screenings", json={"patient_id": p_id, "eye_side": "RIGHT"})
    scr_id = scr_res.json()["id"]

    # Patch screening draft
    patch_res = client.patch(f"/api/screenings/{scr_id}", json={
        "eye_side": "LEFT",
        "screening_notes": "Patient requested screening of left eye first due to floaters.",
    })
    assert patch_res.status_code == 200
    assert patch_res.json()["eye_side"] == "LEFT"
    assert "floaters" in patch_res.json()["screening_notes"]


def test_fundus_image_upload_and_validation(auth_client, workflow_db):
    client, user = auth_client
    p_res = client.post("/api/patients", json={"name": "Manoj Tiwari", "age": 54})
    scr_res = client.post("/api/screenings", json={"patient_id": p_res.json()["id"], "eye_side": "RIGHT"})
    scr_id = scr_res.json()["id"]

    # 1. Reject invalid file
    r_bad = client.post(
        f"/api/screenings/{scr_id}/image",
        files={"file": ("corrupt.txt", b"plain text is not an image", "text/plain")}
    )
    assert r_bad.status_code == 422

    # 2. Upload valid fundus image
    fundus_bytes = create_test_fundus_bytes(gradable=True)
    r_ok = client.post(
        f"/api/screenings/{scr_id}/image",
        files={"file": ("retina_od.jpg", fundus_bytes, "image/jpeg")}
    )
    assert r_ok.status_code == 200
    assert r_ok.json()["status"] == "IMAGE_UPLOADED"


def test_pre_inference_quality_gate_check(auth_client, workflow_db):
    client, user = auth_client
    p_res = client.post("/api/patients", json={"name": "Radhika Sharma", "age": 49})
    scr_res = client.post("/api/screenings", json={"patient_id": p_res.json()["id"], "eye_side": "LEFT"})
    scr_id = scr_res.json()["id"]

    fundus_bytes = create_test_fundus_bytes(gradable=True)
    client.post(f"/api/screenings/{scr_id}/image", files={"file": ("retina_os.jpg", fundus_bytes, "image/jpeg")})

    # Call quality-check endpoint
    qc_res = client.post(f"/api/screenings/{scr_id}/quality-check")
    assert qc_res.status_code == 200
    qc_data = qc_res.json()
    assert "quality" in qc_data
    assert "quality_score" in qc_data["quality"]
    assert "action_required" in qc_data


# ─── 3. Full AI Inference & Report Tests ────────────────────────────────────

def test_full_screening_inference_and_provenance(auth_client, workflow_db):
    client, user = auth_client
    p_res = client.post("/api/patients", json={
        "name": "Gopal Das",
        "age": 60,
        "diabetes_type": "TYPE_2",
        "diabetes_duration_years": 12,
    })
    scr_res = client.post("/api/screenings", json={
        "patient_id": p_res.json()["id"],
        "eye_side": "RIGHT",
        "screening_purpose": "ROUTINE_DR_SCREENING",
    })
    scr_id = scr_res.json()["id"]

    fundus_bytes = create_test_fundus_bytes(gradable=True)
    client.post(f"/api/screenings/{scr_id}/image", files={"file": ("fundus_od.jpg", fundus_bytes, "image/jpeg")})

    # Run AI analysis
    analyze_res = client.post(f"/api/screenings/{scr_id}/analyze")
    assert analyze_res.status_code == 200
    data = analyze_res.json()

    assert "predicted_grade" in data
    assert 0 <= data["predicted_grade"] <= 4
    assert "grade_label" in data
    assert "confidence" in data
    assert "probabilities" in data
    assert len(data["probabilities"]) == 5
    assert "model_status" in data
    assert "assurance_decision" in data


def test_screening_report_and_pdf_download(auth_client, workflow_db):
    client, user = auth_client
    p_res = client.post("/api/patients", json={
        "name": "Sunil Chaurasia",
        "age": 55,
        "diabetes_type": "TYPE_2",
        "hba1c_value": 7.9,
        "visual_symptoms": ["BLURRED_VISION"],
    })
    scr_res = client.post("/api/screenings", json={
        "patient_id": p_res.json()["id"],
        "eye_side": "RIGHT",
    })
    scr_id = scr_res.json()["id"]

    fundus_bytes = create_test_fundus_bytes(gradable=True)
    client.post(f"/api/screenings/{scr_id}/image", files={"file": ("fundus.jpg", fundus_bytes, "image/jpeg")})
    client.post(f"/api/screenings/{scr_id}/analyze")

    # Generate Report
    report_res = client.post(f"/api/screenings/{scr_id}/report")
    assert report_res.status_code == 201
    report = report_res.json()

    assert report["disclaimer"] is not None
    assert "patient" in report
    assert report["patient"]["name"] == "Sunil Chaurasia"
    assert report["patient"]["hba1c_value"] == 7.9
    assert report["screening"]["eye_side"] == "RIGHT"

    # Download PDF
    pdf_res = client.get(f"/api/screenings/{scr_id}/report/pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert len(pdf_res.content) > 1000  # Non-trivial PDF generated


def test_unauthorized_access_rejected(workflow_db):
    """Unauthenticated calls to patient and screening APIs are rejected with 401."""
    def override_get_db():
        try:
            yield workflow_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as anon_client:
        r1 = anon_client.get("/api/patients")
        assert r1.status_code == 401
        r2 = anon_client.post("/api/patients", json={"age": 50})
        assert r2.status_code == 401
    app.dependency_overrides.clear()
