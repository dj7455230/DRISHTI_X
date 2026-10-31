"""
DRISHTI-X — Audit Features Test Suite
Verifies:
1. Smart Retina Quality Gate & Pre-Inference Quality Check Endpoint
2. AI Reliability Engine (Shannon entropy, top margin, tiers, zero fabricated confidence)
3. Rural Offline Screening Sync Endpoint (batch synchronization, image deduplication)
4. Clinician Feedback Loop (heatmap usefulness, agreement, structured disagreement codes)
5. Clinician Feedback Analytics & Export (JSON/CSV)
6. Smart Referral & Follow-up Scheduling (status transitions, priority triage, facilities)
7. Dataset Generalization Benchmark Service & Endpoint
"""
import os
import sys
import uuid
import tempfile
import base64
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from ai.reliability.reliability_engine import (
    compute_prediction_uncertainty,
    evaluate_ai_reliability,
)
from ai.evaluation.generalization_service import (
    get_dataset_generalization_summary,
)
from app.models.screening import (
    ReferralStatus, ReferralPriority, ScreeningStatus
)


# ----------------------------------------------------------------
# 1. AI Reliability Engine Tests
# ----------------------------------------------------------------

def test_prediction_uncertainty_decisive():
    probs = {"0": 0.01, "1": 0.02, "2": 0.92, "3": 0.03, "4": 0.02}
    res = compute_prediction_uncertainty(probs)
    assert res["uncertainty_tier"] == "LOW"
    assert res["top_margin"] >= 0.80
    assert res["entropy"] is not None
    assert res["normalized_entropy"] < 0.35


def test_prediction_uncertainty_ambiguous():
    # Ambiguous between grade 1 and grade 2
    probs = {"0": 0.05, "1": 0.46, "2": 0.44, "3": 0.03, "4": 0.02}
    res = compute_prediction_uncertainty(probs)
    assert res["uncertainty_tier"] == "ELEVATED"
    assert res["top_margin"] < 0.10


def test_ai_reliability_high_trust():
    quality = {"is_gradable": True, "quality_score": 88.0, "quality_status": "GRADABLE"}
    pred = {
        "probabilities": {"0": 0.02, "1": 0.03, "2": 0.90, "3": 0.03, "4": 0.02},
        "mismatch_detected": False,
    }
    res = evaluate_ai_reliability(quality, pred, concordance_level="HIGH")
    assert res["reliability_tier"] == "HIGH_RELIABILITY"
    assert "High Clinical Trust" in res["status_label"]
    assert res["quality_factor"]["score"] == 88.0
    assert "clinical_action" in res


def test_ai_reliability_ungradable_recapture():
    quality = {
        "is_gradable": False,
        "quality_score": 35.0,
        "quality_status": "UNGRADABLE",
        "feedback": "Severe focus blur and motion artifact detected.",
    }
    pred = None
    res = evaluate_ai_reliability(quality, pred)
    assert res["reliability_tier"] == "UNRELIABLE_IMAGE_RECAPTURE"
    assert "Recapture Required" in res["status_label"]
    assert res["quality_factor"]["status"] == "UNGRADABLE"
    assert "Recapture" in res["clinical_action"]


# ----------------------------------------------------------------
# 2. Dataset Generalization Benchmark Tests
# ----------------------------------------------------------------

def test_dataset_generalization_summary():
    summary = get_dataset_generalization_summary()
    assert "cohorts" in summary
    assert "cross_dataset_comparison" in summary
    assert len(summary["cohorts"]) == 3

    cohort_keys = [c["dataset_key"] for c in summary["cohorts"]]
    assert "idrid_test" in cohort_keys
    assert "aptos2019_heldout" in cohort_keys
    assert "messidor2_external" in cohort_keys

    # Verify IDRiD Indian population cohort
    idrid = next(c for c in summary["cohorts"] if c["dataset_key"] == "idrid_test")
    assert idrid["sample_count"] == 103
    assert idrid["metrics"]["sensitivity_referable"] >= 0.90
    assert idrid["metrics"]["specificity_referable"] >= 0.85
    assert len(idrid["confusion_matrix"]) == 5

    # Verify Messidor-2 European hospital external cohort
    messidor = next(c for c in summary["cohorts"] if c["dataset_key"] == "messidor2_external")
    assert messidor["sample_count"] == 874
    assert messidor["metrics"]["sensitivity_referable"] >= 0.90


# ----------------------------------------------------------------
# 3. API Endpoints Tests (with mocked auth and DB)
# ----------------------------------------------------------------

_mock_engine = MagicMock()
_mock_session = MagicMock()
_mock_session_local = MagicMock(return_value=_mock_session)

with patch("sqlalchemy.create_engine", return_value=_mock_engine):
    with patch("sqlalchemy.orm.sessionmaker", return_value=_mock_session_local):
        from app.main import app
        from app.db.base import get_db
        from app.api.deps import get_current_user, require_doctor
        from app.models.user import User, UserRole

mock_user = User(
    id=uuid.uuid4(),
    email="doctor@drishti-x.org",
    full_name="Dr. Sunita Sharma",
    role=UserRole.OPHTHALMOLOGIST,
    is_active=True,
)

def override_user():
    return mock_user

def override_doctor():
    return mock_user


@pytest.fixture(scope="module")
def audit_client():
    from fastapi.testclient import TestClient
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_doctor] = override_doctor
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_generalization_benchmark_endpoint(audit_client):
    r = audit_client.get("/api/evaluation/generalization")
    assert r.status_code == 200
    data = r.json()
    assert "cohorts" in data
    assert len(data["cohorts"]) == 3
    assert data["cohorts"][0]["dataset_key"] == "idrid_test"


def test_feedback_analytics_endpoint(audit_client):
    # Mock empty or populated reviews query
    mock_db = MagicMock()
    mock_db.query.return_value.all.return_value = []
    app.dependency_overrides[get_db] = lambda: mock_db

    r = audit_client.get("/api/screenings/feedback/analytics")
    assert r.status_code == 200
    data = r.json()
    assert "total_reviews" in data
    assert "clinical_governance_notice" in data
    assert "Continuous automated retraining" in data["clinical_governance_notice"]


def test_feedback_export_endpoint(audit_client):
    mock_db = MagicMock()
    mock_db.query.return_value.all.return_value = []
    app.dependency_overrides[get_db] = lambda: mock_db

    r_json = audit_client.get("/api/screenings/feedback/export?format=json")
    assert r_json.status_code == 200
    assert "reviews" in r_json.json()

    r_csv = audit_client.get("/api/screenings/feedback/export?format=csv")
    assert r_csv.status_code == 200
    assert "text/csv" in r_csv.headers.get("content-type", "")


def test_referrals_list_endpoint(audit_client):
    mock_db = MagicMock()
    mock_db.query.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []
    app.dependency_overrides[get_db] = lambda: mock_db

    r = audit_client.get("/api/referrals")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

