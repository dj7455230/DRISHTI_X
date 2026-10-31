"""
DRISHTI-X — Automated Integration Tests for Features 41–45
- Feature 41: Dataset Transparency Panel (APTOS, IDRiD, Messidor-2, tasks & manifests)
- Feature 42: Model Information Panel (EfficientNet-B0, U-Net, Grad-CAM, Assurance)
- Feature 43: Cross-Dataset Validation Framework (Adapters & Label Mapping Validation)
- Feature 44: Complete Audit Trail with Tamper-Evident Hash Chaining
- Feature 45: Secure Authentication & RBAC Permission Matrix
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
from app.models.audit import AuditLog
from app.core.security import hash_password, create_access_token
from app.services.audit_service import AuditService, GENESIS_HASH
from ai.evaluation.cross_dataset_adapter import (
    ADAPTER_REGISTRY,
    AptosAdapter,
    Messidor2Adapter,
    DDRAdapter,
    IncompatibleLabelMappingError,
)

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
            "prev_event_hash VARCHAR(64) NULL",
            "event_hash VARCHAR(64) NULL",
        ]:
            try:
                conn.execute(text(f"ALTER TABLE screenings ADD COLUMN {col_def}"))
            except Exception:
                pass
            try:
                conn.execute(text(f"ALTER TABLE audit_logs ADD COLUMN {col_def}"))
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
def admin_auth(db_session):
    user = db_session.query(User).filter(User.email == "admin_audit@drishti.org").first()
    if not user:
        user = User(
            id=uuid.uuid4(),
            email="admin_audit@drishti.org",
            full_name="Admin Audit Officer",
            hashed_password=hash_password("AdminSecurePass123!"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
    token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
    return {"headers": {"Authorization": f"Bearer {token}"}, "user": user}


@pytest.fixture
def health_worker_auth(db_session):
    user = db_session.query(User).filter(User.email == "hw_rural@drishti.org").first()
    if not user:
        user = User(
            id=uuid.uuid4(),
            email="hw_rural@drishti.org",
            full_name="Rural Health Worker",
            hashed_password=hash_password("HWPass123!"),
            role=UserRole.HEALTH_WORKER,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
    token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
    return {"headers": {"Authorization": f"Bearer {token}"}, "user": user}


def test_feature_41_dataset_inventory_endpoint(client, health_worker_auth):
    """
    Feature 41: Dataset inventory endpoint returns verified dataset information,
    split counts, licenses, and explicit task boundaries (APTOS=Classif, IDRiD=Seg).
    """
    resp = client.get("/api/evaluation/datasets/inventory", headers=health_worker_auth["headers"])
    assert resp.status_code == 200
    data = resp.json()

    assert "datasets" in data
    assert len(data["datasets"]) == 3

    # 1. APTOS 2019
    aptos = next((d for d in data["datasets"] if d["id"] == "aptos2019"), None)
    assert aptos is not None
    assert aptos["assigned_model"] == "EfficientNet-B0 (Transfer Learning)"
    assert aptos["split_counts"]["train"] == 2563
    assert aptos["split_counts"]["validation"] == 549
    assert aptos["split_counts"]["held_out_test"] == 550
    assert "NOT used for U-Net" in aptos["explicit_scope_note"] or "NOT used for pixel-level" in aptos["explicit_scope_note"]

    # 2. IDRiD
    idrid = next((d for d in data["datasets"] if d["id"] == "idrid"), None)
    assert idrid is not None
    assert idrid["assigned_model"] == "4-Stage Encoder/Decoder U-Net (4 Output Channels)"
    assert len(idrid["classes"]) == 4
    # Optic Disc must be noted as anatomical structure, not DR lesion
    od_class = next((c for c in idrid["classes"] if c["code"] == "OD"), None)
    assert od_class is not None
    assert od_class["is_dr_lesion"] is False

    # 3. Messidor-2
    messidor = next((d for d in data["datasets"] if d["id"] == "messidor2"), None)
    assert messidor is not None
    assert messidor["split_counts"]["external_evaluation_set"] == 1744
    assert messidor["split_counts"]["training_leakage_count"] == 0


def test_feature_42_models_information_overview(client, health_worker_auth):
    """
    Feature 42: Model information panel serves architectural specs, input/output tensors,
    checkpoints, and clinical limitations for all modules.
    """
    resp = client.get("/api/evaluation/models/info", headers=health_worker_auth["headers"])
    assert resp.status_code == 200
    data = resp.json()

    models = data["models_and_services"]
    assert len(models) == 5

    eff = next((m for m in models if m["id"] == "efficientnet_b0"), None)
    assert eff is not None
    assert eff["input_specs"]["shape"] == "[1, 3, 512, 512]"
    assert eff["output_specs"]["shape"] == "[1, 5]"

    unet = next((m for m in models if m["id"] == "unet_lesion"), None)
    assert unet is not None
    assert unet["output_specs"]["shape"] == "[1, 4, 512, 512]"

    gradcam = next((m for m in models if m["id"] == "gradcam"), None)
    assert gradcam is not None
    assert "explainability" in gradcam["known_limitations"][0].lower() or "NOT histological" in gradcam["known_limitations"][0]


def test_feature_43_cross_dataset_adapters_and_validation(client, health_worker_auth):
    """
    Feature 43: Registered cross-dataset adapters and class mapping validation.
    Rejects incompatible labels without silent distortion.
    """
    resp = client.get("/api/evaluation/cross-dataset/adapters", headers=health_worker_auth["headers"])
    assert resp.status_code == 200
    adapters = resp.json()
    assert len(adapters) >= 4

    # Compatible validation on Messidor-2
    val_resp = client.post(
        "/api/evaluation/cross-dataset/validate",
        headers=health_worker_auth["headers"],
        json={
            "adapter_id": "messidor2",
            "target_schema": {
                "0": "No DR",
                "1": "Mild NPDR",
                "2": "Moderate NPDR",
                "3": "Severe NPDR",
                "4": "Proliferative DR",
            },
        },
    )
    assert val_resp.status_code == 200
    assert val_resp.json()["is_compatible"] is True

    # Incompatible validation (mapping unknown class 99)
    incomp_resp = client.post(
        "/api/evaluation/cross-dataset/validate",
        headers=health_worker_auth["headers"],
        json={
            "adapter_id": "messidor2",
            "target_schema": {
                "0": "No DR",
                "99": "Unknown Grade Protocol",
            },
        },
    )
    assert incomp_resp.status_code == 200
    assert incomp_resp.json()["is_compatible"] is False
    assert len(incomp_resp.json()["missing_or_unmapped_classes"]) > 0


def test_feature_44_tamper_evident_audit_chain(db_session, client, admin_auth):
    """
    Feature 44: Tamper-evident hash chaining records events and detects tampering.
    """
    # 1. Log three sequential events using AuditService
    ev1 = AuditService.log_event(
        db=db_session,
        action="PATIENT_REGISTERED",
        user_id=admin_auth["user"].id,
        detail="Registered test patient",
    )
    assert ev1.prev_event_hash == GENESIS_HASH
    assert len(ev1.event_hash) == 64

    ev2 = AuditService.log_event(
        db=db_session,
        action="AI_PREDICTION_COMPLETED",
        detail="Predicted Grade 2 with 88% confidence",
    )
    assert ev2.prev_event_hash == ev1.event_hash

    ev3 = AuditService.log_event(
        db=db_session,
        action="DOCTOR_REVIEW_ACCEPTED",
        user_id=admin_auth["user"].id,
        detail="Ophthalmologist confirmed Grade 2",
    )
    assert ev3.prev_event_hash == ev2.event_hash

    # 2. Verify chain via endpoint
    resp = client.get("/api/audit/verify-chain", headers=admin_auth["headers"])
    assert resp.status_code == 200
    report = resp.json()
    assert report["chain_status"] == "INTACT"
    assert report["tampering_detected"] is False
    assert report["total_records_verified"] >= 3


def test_feature_45_rbac_permission_matrix_and_route_protection(client, health_worker_auth, admin_auth):
    """
    Feature 45: Permission matrix endpoint and server-side RBAC protection.
    Health workers must be forbidden from accessing admin audit verification.
    """
    # 1. Permission Matrix
    resp = client.get("/api/auth/permission-matrix")
    assert resp.status_code == 200
    matrix = resp.json()
    assert "roles" in matrix
    assert "HEALTH_WORKER" in matrix["roles"]
    assert "OPHTHALMOLOGIST" in matrix["roles"]
    assert "ADMIN" in matrix["roles"]
    assert matrix["permissions"]["clinical_diagnosis_override"]["HEALTH_WORKER"] is False
    assert matrix["permissions"]["clinical_diagnosis_override"]["OPHTHALMOLOGIST"] is True

    # 2. RBAC Endpoint Protection: Health worker cannot access admin audit verification
    forbidden_resp = client.get("/api/audit/verify-chain", headers=health_worker_auth["headers"])
    assert forbidden_resp.status_code == 403

    # 3. Admin can access
    allowed_resp = client.get("/api/audit/verify-chain", headers=admin_auth["headers"])
    assert allowed_resp.status_code == 200
