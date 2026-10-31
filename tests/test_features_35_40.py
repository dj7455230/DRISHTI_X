"""
DRISHTI-X — Automated Integration Tests for Features 35–40
- Feature 35: Telemedicine Specialist Portal (Queue, Limited Evidence, Request Full Image)
- Feature 37: Rural Network Simulation Mesh
- Feature 38: Bandwidth Comparison Demo (FIFO vs DRISHTI-X Priority-Aware Sync)
- Feature 39: Specialist Workload Simulation
- Feature 40: Model Evaluation Dashboard (APTOS, IDRiD, Messidor-2 artifacts provenance)
"""
import pytest
import os
import sys
import uuid
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
from app.models.patient import Patient
from app.models.screening import Screening, ScreeningStatus, EvidenceCapsule, DoctorReview
from app.core.security import hash_password, create_access_token

# Test database
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
def doctor_auth(db_session):
    user = db_session.query(User).filter(User.email == "dr_telemed@drishti.org").first()
    if not user:
        user = User(
            id=uuid.uuid4(),
            email="dr_telemed@drishti.org",
            full_name="Dr. Telemedicine Specialist",
            hashed_password=hash_password("TelemedDocPass123!"),
            role=UserRole.OPHTHALMOLOGIST,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
    token = create_access_token(data={"sub": str(user.id)})
    return {
        "headers": {"Authorization": f"Bearer {token}"},
        "user": user,
    }


def test_telemedicine_queue_and_limited_evidence(client, doctor_auth, db_session):
    """
    Feature 35: Telemedicine queue returns cases requiring review,
    distinguishing capsule-only (limited evidence) from full image cases.
    """
    patient = Patient(
        id=uuid.uuid4(),
        patient_code="PT-TELE-001",
        name="Rameshwar Lal",
        age=58,
        diabetes_type="Type 2",
        diabetes_duration_years=14,
        hba1c_value=9.2,
    )
    db_session.add(patient)

    screening = Screening(
        id=uuid.uuid4(),
        patient_id=patient.id,
        created_by=doctor_auth["user"].id,
        status=ScreeningStatus.CAPSULE_SYNCED,
        priority_level="CRITICAL",
        priority_score=94.5,
        capsule_synced=True,
        full_image_pending=True,
    )
    db_session.add(screening)

    capsule = EvidenceCapsule(
        id=uuid.uuid4(),
        screening_id=screening.id,
        case_number="CASE-TELE-001",
        patient_ref_id="REF-PT-RMLAL",
        predicted_grade=3,
        grade_label="Severe NPDR",
        confidence=0.88,
        priority_level="CRITICAL",
        priority_score=94.5,
        image_checksum="abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        full_image_synced=False,
    )
    db_session.add(capsule)
    db_session.commit()

    resp = client.get("/api/screenings/telemedicine/queue", headers=doctor_auth["headers"])
    assert resp.status_code == 200
    queue = resp.json()
    assert len(queue) >= 1

    case = next((c for c in queue if c["id"] == str(screening.id)), None)
    assert case is not None
    assert case["priority_tier"] == "CRITICAL"
    assert case["capsule_synced"] is True
    assert case["full_image_pending"] is True
    assert case["patient"]["name"] == "Rameshwar Lal"


def test_request_full_image_action(client, doctor_auth, db_session):
    """
    Feature 35: Ophthalmologist requests expedited full-resolution image.
    """
    patient = Patient(
        id=uuid.uuid4(),
        patient_code="PT-TELE-002",
        name="Kamla Devi",
        age=62,
    )
    db_session.add(patient)

    screening = Screening(
        id=uuid.uuid4(),
        patient_id=patient.id,
        created_by=doctor_auth["user"].id,
        status=ScreeningStatus.CAPSULE_SYNCED,
        priority_level="HIGH",
        priority_score=78.0,
        capsule_synced=True,
        full_image_pending=False,
    )
    db_session.add(screening)
    db_session.commit()

    resp = client.post(f"/api/screenings/{screening.id}/request-full-image", headers=doctor_auth["headers"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "REQUESTED"
    assert data["full_image_pending"] is True

    # Check database state
    db_screening = db_session.query(Screening).filter(Screening.id == screening.id).first()
    assert db_screening.full_image_pending is True


def test_rural_network_mesh_simulation(client, doctor_auth):
    """
    Feature 37: Rural network simulation returns multi-PHC mesh metrics
    with clear 'PYTHON NETWORK SIMULATION' label.
    """
    resp = client.get("/api/simulation/network-mesh?specialists=3&hours_per_day=8.0", headers=doctor_auth["headers"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["simulation_engine"] == "PYTHON NETWORK SIMULATION"
    assert "SIMULATION RESULTS" in data["disclaimer"]
    assert "network_summary" in data
    assert data["network_summary"]["total_phcs"] == 5
    assert len(data["phc_nodes"]) == 5


def test_bandwidth_comparison_simulation(client, doctor_auth):
    """
    Feature 38: Bandwidth comparison between FIFO and Priority-Aware Sync
    under identical inputs and random seed.
    """
    resp = client.get(
        "/api/simulation/bandwidth-comparison?num_cases=50&bandwidth_kbps=128&random_seed=42",
        headers=doctor_auth["headers"]
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["simulation_engine"] == "PYTHON NETWORK SIMULATION"
    assert "fifo_strategy" in data
    assert "priority_aware_strategy" in data

    fifo_first_crit = data["fifo_strategy"]["summary"]["time_to_first_critical_sec"]
    prio_first_crit = data["priority_aware_strategy"]["summary"]["time_to_first_critical_sec"]
    # Under priority-aware capsule sync, first critical arrival is significantly faster
    assert prio_first_crit <= fifo_first_crit
    assert "first_critical_arrival_reduction_pct" in data["comparison_highlights"]


def test_specialist_workload_simulation(client, doctor_auth):
    """
    Feature 39: Specialist Workload simulation modeling 500 cases and
    queuing theory with burnout assessment.
    """
    resp = client.get(
        "/api/simulation/specialist-workload?num_cases=500&specialists=3&hours_per_day=8.0",
        headers=doctor_auth["headers"]
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["inputs"]["total_cases_generated"] == 500
    assert "cohort_breakdown" in data
    assert "capacity" in data
    assert "unassisted_fifo" in data
    assert "drishti_priority_triage" in data
    assert data["outcomes"]["workload_reduction_pct"] > 0
    assert "burnout_risk" in data["drishti_priority_triage"]


def test_model_evaluation_metrics_provenance(client, doctor_auth):
    """
    Feature 40: Evaluation metrics API reads actual saved evaluation artifacts
    from disk without fabricated numbers, returning provenance and hashes.
    """
    resp = client.get("/api/evaluation/metrics", headers=doctor_auth["headers"])
    assert resp.status_code == 200
    data = resp.json()

    # Check classification (APTOS 2019)
    assert data["classification"]["status"] == "EVALUATED"
    assert data["classification"]["metrics"]["n_samples"] == 550
    assert abs(data["classification"]["metrics"]["multiclass"]["accuracy"] - 0.7436) < 0.001
    assert data["classification"]["provenance"]["sha256"] is not None

    # Check segmentation (IDRiD)
    assert data["segmentation"]["status"] == "EVALUATED"
    assert data["segmentation"]["metrics"]["n_images"] == 27
    assert "per_class" in data["segmentation"]["metrics"]

    # Check external validation (Messidor-2)
    assert data["external_validation"]["status"] == "EVALUATED"
    assert data["external_validation"]["metrics"]["external_test_n"] == 1744
    assert abs(data["external_validation"]["metrics"]["multiclass"]["accuracy"] - 0.6147) < 0.001
    assert "domain_shift_notice" in data["external_validation"]


def test_model_evaluation_export(client, doctor_auth):
    """
    Feature 40: Export downloadable evaluation audit report.
    """
    resp = client.get("/api/evaluation/export", headers=doctor_auth["headers"])
    assert resp.status_code == 200
    assert resp.headers["content-disposition"].startswith("attachment;")
    data = resp.json()
    assert "classification" in data
    assert "segmentation" in data
    assert "external_validation" in data
