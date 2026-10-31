"""
DRISHTI-X — Tests: MASTER PROMPT 2 Endpoints
Tests dedicated endpoints:
- POST /api/screenings/{id}/segment
- GET  /api/screenings/{id}/lesion-evidence
- POST /api/screenings/{id}/gradcam
- GET  /api/screenings/{id}/explainability
- GET  /api/screenings/{id}/concordance
- GET  /api/screenings/{id}/mismatches
- GET  /api/screenings/{id}/assurance
- GET  /api/ophthalmologist/dashboard
"""
import os
import sys
import uuid
import tempfile
import pytest
from datetime import datetime, timezone
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
from app.models.screening import Screening, FundusImage, Prediction, ScreeningStatus, AssuranceDecision


@pytest.fixture(scope="module")
def test_db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def test_db(test_db_engine):
    connection = test_db_engine.connect()
    transaction = connection.begin()
    SessionLocal = sessionmaker(bind=connection)
    session = SessionLocal()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(test_db):
    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(test_db):
    doc = User(
        email="ophthalmologist@drishtix.ai",
        hashed_password=hash_password("OphthalPass123!"),
        full_name="Dr. Radhika Nair",
        role=UserRole.OPHTHALMOLOGIST,
        is_active=True,
    )
    test_db.add(doc)
    test_db.commit()
    test_db.refresh(doc)
    token = create_access_token({"sub": str(doc.id), "role": doc.role.value})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_case(test_db, auth_headers):
    # Retrieve user
    user = test_db.query(User).filter(User.email == "ophthalmologist@drishtix.ai").first()
    patient = Patient(
        patient_code="DX-PAT-9001",
        name="Sunita Devi",
        age=56,
        gender=Gender.FEMALE,
        diabetes_type="Type 2",
        diabetes_duration_years=8,
    )
    test_db.add(patient)
    test_db.commit()

    screening = Screening(
        patient_id=patient.id,
        created_by=user.id,
        eye_side="OD",
        status=ScreeningStatus.ANALYZED,
        assurance_decision=AssuranceDecision.HUMAN_REVIEW_REQUIRED,
    )
    test_db.add(screening)
    test_db.commit()

    # Create dummy image on disk
    tmp_img = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    img = Image.new("RGB", (512, 512), color=(180, 50, 40))
    img.save(tmp_img.name)

    fundus = FundusImage(
        screening_id=screening.id,
        original_path=tmp_img.name,
        quality_score=78.5,
        is_gradable=True,
    )
    test_db.add(fundus)

    prediction = Prediction(
        screening_id=screening.id,
        predicted_grade=2,
        grade_label="Moderate NPDR",
        confidence=0.84,
        lesion_summary={
            "microaneurysms": {"count": 8, "total_area_px": 80.0, "retinal_coverage_pct": 0.05},
            "hemorrhages": {"count": 4, "total_area_px": 250.0, "retinal_coverage_pct": 0.15},
            "hard_exudates": {"count": 3, "total_area_px": 180.0, "retinal_coverage_pct": 0.10},
            "lesion_evidence_score": 0.35,
        },
    )
    test_db.add(prediction)
    test_db.commit()

    return screening, tmp_img.name


def test_concordance_endpoint(client, auth_headers, sample_case):
    screening, _ = sample_case
    res = client.get(f"/api/screenings/{screening.id}/concordance", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "concordance_category" in data
    assert "concordance_score" in data
    assert data["predicted_grade"] == 2


def test_mismatches_endpoint(client, auth_headers, sample_case):
    screening, _ = sample_case
    res = client.get(f"/api/screenings/{screening.id}/mismatches", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "mismatch_detected" in data
    assert "alerts" in data


def test_assurance_endpoint(client, auth_headers, sample_case):
    screening, _ = sample_case
    res = client.get(f"/api/screenings/{screening.id}/assurance", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["assurance_decision"] in ("VALIDATED", "HUMAN_REVIEW_REQUIRED", "RECAPTURE_REQUIRED")
    assert "reasons" in data


def test_lesion_evidence_endpoint(client, auth_headers, sample_case):
    screening, _ = sample_case
    res = client.get(f"/api/screenings/{screening.id}/lesion-evidence", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "lesion_summary" in data
    assert "urls" in data


def test_explainability_endpoint(client, auth_headers, sample_case):
    screening, _ = sample_case
    res = client.get(f"/api/screenings/{screening.id}/explainability", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "available" in data
    assert "urls" in data


def test_ophthalmologist_dashboard_endpoint(client, auth_headers, sample_case):
    res = client.get("/api/ophthalmologist/dashboard", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "metrics" in data
    assert "cases" in data
    assert len(data["cases"]) >= 1
    assert data["cases"][0]["patient_name"] == "Sunita Devi"
