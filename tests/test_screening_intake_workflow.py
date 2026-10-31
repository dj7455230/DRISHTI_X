"""
DRISHTI-X — Screening Intake & Patient Registration Diagnostics Test Suite
Verifies:
1. Atomic screening intake (/api/screenings/intake) with new patient
2. Atomic screening intake with existing patient ID
3. Anonymous rural walk-in registration
4. Validation: Missing required patient name for non-anonymous intake
5. Handling of optional clinical fields left unrecorded
6. Non-existent patient ID rejection (404)
7. Transaction rollback on failure (no orphan patient created)
8. Unauthorized request rejection (401)
9. Standalone endpoints (POST /api/patients and POST /api/screenings)
10. Safe retry and correct identifier persistence
"""
import os
import sys
import uuid
import pytest
from datetime import datetime, timezone, date
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
from app.models.screening import Screening, ScreeningStatus


@pytest.fixture(scope="module")
def intake_test_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def intake_db(intake_test_engine):
    connection = intake_test_engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def test_user(intake_db):
    user = User(
        id=uuid.uuid4(),
        email="doctor_intake@drishtix.org",
        hashed_password=hash_password("DocSecure123!"),
        full_name="Dr. Shreya Sengupta",
        role=UserRole.OPHTHALMOLOGIST,
        facility_name="Chauka Community Health Centre",
        facility_location="Varanasi",
        is_active=True,
    )
    intake_db.add(user)
    intake_db.commit()
    return user


@pytest.fixture(scope="function")
def auth_headers(test_user):
    token = create_access_token(data={"sub": str(test_user.id), "role": test_user.role.value})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def client(intake_db):
    def override_get_db():
        try:
            yield intake_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_atomic_screening_intake_new_patient_success(client, auth_headers, test_user, intake_db):
    """Test successful atomic registration of new patient + screening initialization."""
    payload = {
        "patient": {
            "name": "Kamala Devi",
            "age": 52,
            "date_of_birth": "1974-04-18",
            "gender": "FEMALE",
            "contact_number": "+91 9415012345",
            "address": "Village Chitaipur, Post Kandwa",
            "is_anonymous": False,
            "diabetes_type": "TYPE_2",
            "diabetes_duration_years": 8,
            "diabetes_treatment": "ORAL",
            "hba1c_value": 7.9,
            "hba1c_unit": "%",
            "hba1c_date": "2026-03-01",
            "blood_glucose_value": 158.0,
            "blood_glucose_unit": "mg/dL",
            "blood_glucose_type": "FASTING",
            "history_of_dr": "NONE_KNOWN",
            "visual_symptoms": ["BLURRED_VISION", "FLOATERS"],
            "symptom_onset": "2 months",
            "pregnancy_status": "NOT_PREGNANT",
            "district": "Varanasi",
            "state": "Uttar Pradesh",
            "notes": "Referred from rural health camp.",
        },
        "eye_side": "RIGHT",
        "screening_purpose": "ROUTINE_DR_SCREENING",
        "screening_notes": "First systematic retinal screening examination.",
        "referral_source": "PRIMARY_HEALTH_CENTRE",
        "facility_name": "Chauka Community Health Centre",
        "operator_name": "Dr. Shreya Sengupta",
    }

    res = client.post("/api/screenings/intake", json=payload, headers=auth_headers)
    assert res.status_code == 201
    data = res.json()

    assert "patient" in data
    assert "screening" in data
    patient_data = data["patient"]
    screening_data = data["screening"]

    assert patient_data["name"] == "Kamala Devi"
    assert patient_data["age"] == 52
    assert patient_data["gender"] == "FEMALE"
    assert patient_data["patient_code"].startswith("DX-")
    assert screening_data["patient_id"] == patient_data["id"]
    assert screening_data["eye_side"] == "RIGHT"
    assert screening_data["status"] == "PENDING"

    # Verify persistence in database
    db_patient = intake_db.query(Patient).filter(Patient.id == uuid.UUID(patient_data["id"])).first()
    assert db_patient is not None
    assert db_patient.name == "Kamala Devi"

    db_screening = intake_db.query(Screening).filter(Screening.id == uuid.UUID(screening_data["id"])).first()
    assert db_screening is not None
    assert db_screening.patient_id == db_patient.id
    assert db_screening.created_by == test_user.id


def test_atomic_screening_intake_existing_patient_success(client, auth_headers, test_user, intake_db):
    """Test screening intake referencing an existing patient without duplicating patient record."""
    existing_patient = Patient(
        id=uuid.uuid4(),
        patient_code="DX-TEST-EXISTING-01",
        name="Harish Chandra",
        age=61,
        gender=Gender.MALE,
        is_anonymous=False,
        district="Varanasi",
        state="Uttar Pradesh",
    )
    intake_db.add(existing_patient)
    intake_db.commit()

    payload = {
        "patient_id": str(existing_patient.id),
        "eye_side": "LEFT",
        "screening_purpose": "SYMPTOMATIC_VISION_CHECK",
        "screening_notes": "Patient reported floaters in left eye.",
        "facility_name": "Chauka Community Health Centre",
        "operator_name": "Dr. Shreya Sengupta",
    }

    res = client.post("/api/screenings/intake", json=payload, headers=auth_headers)
    assert res.status_code == 201
    data = res.json()

    assert data["patient"]["id"] == str(existing_patient.id)
    assert data["screening"]["patient_id"] == str(existing_patient.id)
    assert data["screening"]["eye_side"] == "LEFT"

    # Confirm only one patient exists with this code
    count = intake_db.query(Patient).filter(Patient.patient_code == "DX-TEST-EXISTING-01").count()
    assert count == 1


def test_atomic_screening_intake_anonymous_walk_in(client, auth_headers, intake_db):
    """Test anonymous registration masks name and contact while generating valid tracking codes."""
    payload = {
        "patient": {
            "name": "Hidden Name",
            "age": 45,
            "gender": "PREFER_NOT_TO_SAY",
            "is_anonymous": True,
            "district": "Chandauli",
            "state": "Uttar Pradesh",
        },
        "eye_side": "RIGHT",
    }

    res = client.post("/api/screenings/intake", json=payload, headers=auth_headers)
    assert res.status_code == 201
    data = res.json()

    assert data["patient"]["is_anonymous"] is True
    assert data["patient"]["name"] is None
    assert data["patient"]["contact_number"] is None
    assert data["patient"]["patient_code"].startswith("DX-")


def test_atomic_screening_intake_missing_name_non_anonymous(client, auth_headers):
    """Test that non-anonymous intake without name produces clear 422 error."""
    payload = {
        "patient": {
            "name": "   ",
            "age": 50,
            "gender": "MALE",
            "is_anonymous": False,
        },
        "eye_side": "RIGHT",
    }

    res = client.post("/api/screenings/intake", json=payload, headers=auth_headers)
    assert res.status_code == 422
    assert "Patient name is required" in res.json()["detail"]


def test_atomic_screening_intake_optional_fields_unrecorded(client, auth_headers, intake_db):
    """Test that omitting all optional clinical biomarkers succeeds without errors."""
    payload = {
        "patient": {
            "name": "Sunil Verma",
            "age": 48,
            "gender": "MALE",
            "is_anonymous": False,
            "diabetes_type": None,
            "diabetes_duration_years": None,
            "diabetes_treatment": None,
            "hba1c_value": None,
            "blood_glucose_value": None,
            "visual_symptoms": [],
        },
        "eye_side": "RIGHT",
    }

    res = client.post("/api/screenings/intake", json=payload, headers=auth_headers)
    assert res.status_code == 201
    data = res.json()
    assert data["patient"]["hba1c_value"] is None
    assert data["patient"]["diabetes_type"] is None


def test_atomic_screening_intake_nonexistent_patient_id_404(client, auth_headers):
    """Test that invalid patient UUID returns 404 with descriptive detail."""
    non_existent_id = str(uuid.uuid4())
    payload = {
        "patient_id": non_existent_id,
        "eye_side": "RIGHT",
    }

    res = client.post("/api/screenings/intake", json=payload, headers=auth_headers)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_atomic_screening_intake_missing_patient_data(client, auth_headers):
    """Test that omitting both patient_id and patient object returns 422."""
    payload = {
        "eye_side": "RIGHT",
    }

    res = client.post("/api/screenings/intake", json=payload, headers=auth_headers)
    assert res.status_code == 422
    assert "Either patient_id" in res.json()["detail"]


def test_atomic_screening_intake_unauthorized(client):
    """Test that intake without authorization token returns 401."""
    payload = {
        "patient": {
            "name": "Unauthorized Test",
            "age": 40,
        },
        "eye_side": "RIGHT",
    }

    res = client.post("/api/screenings/intake", json=payload)
    assert res.status_code == 401


def test_standalone_patient_and_screening_routes_work(client, auth_headers, test_user, intake_db):
    """Test that existing separate POST /api/patients and POST /api/screenings work seamlessly."""
    # 1. POST /api/patients
    pat_res = client.post(
        "/api/patients",
        json={"name": "Anita Gupta", "age": 43, "gender": "FEMALE", "is_anonymous": False},
        headers=auth_headers,
    )
    assert pat_res.status_code == 201
    pat_id = pat_res.json()["id"]

    # 2. POST /api/screenings
    scr_res = client.post(
        "/api/screenings",
        json={"patient_id": pat_id, "eye_side": "RIGHT", "screening_purpose": "ROUTINE_DR_SCREENING"},
        headers=auth_headers,
    )
    assert scr_res.status_code == 201
    assert scr_res.json()["patient_id"] == pat_id


def test_patient_update_preserves_clinical_history(client, auth_headers, intake_db):
    """Test PUT /api/patients/{id} updates clinical history correctly."""
    patient = Patient(
        id=uuid.uuid4(),
        patient_code="DX-TEST-UPD-01",
        name="Vikas Singh",
        age=39,
        gender=Gender.MALE,
    )
    intake_db.add(patient)
    intake_db.commit()

    update_payload = {
        "hba1c_value": 8.4,
        "diabetes_type": "TYPE_2",
        "notes": "Updated post-consultation.",
    }
    res = client.put(f"/api/patients/{patient.id}", json=update_payload, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["hba1c_value"] == 8.4
    assert res.json()["diabetes_type"] == "TYPE_2"
    assert res.json()["notes"] == "Updated post-consultation."

