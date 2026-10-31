"""
DRISHTI-X — Comprehensive Automated Test Suite for Features 21–30
Covers:
  - Feature 21: Priority Referral Queue (filtering, sorting, review vs recapture queues)
  - Feature 22: Priority Score & Triage Tagging (CRITICAL, HIGH, MEDIUM, ROUTINE)
  - Feature 23: Doctor Review Actions (ACCEPT, REVIEW_FURTHER, REFER, RECAPTURE)
  - Feature 24: Human-in-the-Loop Governance & Role Authorization Guards
  - Feature 25: Patient Case History & Longitudinal Screening Comparison
  - Feature 26: 17-Section PDF Screening Report Generation
  - Feature 27: Unique Case Numbering & Persistent Analysis Jobs
  - Feature 28: FastAPI-MATLAB Diagnostics & Connection Checks
  - Feature 29: Live 11-Stage Analysis Job Status Endpoint
  - Feature 30: Standardized Error Responses (error_code, reference_id, retryable)
"""
import os
import sys
import uuid
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app
from app.db.base import get_db, Base, engine
from app.models.user import User, UserRole
from app.models.patient import Patient, Gender
from app.models.screening import (
    Screening, FundusImage, Prediction, DoctorReview, DoctorReviewAction,
    ScreeningStatus, AssuranceDecision, ReferralPriority, AnalysisJob, JobStatus
)
from app.core.security import create_access_token
from ai.assurance.priority_scoring_service import PriorityScoringService
from app.services.analysis_job_service import AnalysisJobService
from app.services.pdf_report_service import generate_pdf_report, MANDATORY_CLINICAL_DISCLAIMER


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = next(get_db())
    yield db
    db.close()


@pytest.fixture
def auth_headers(db_session):
    # Ensure doctor and health worker exist
    doctor = db_session.query(User).filter(User.email == "doctor_test_2130@drishti.ai").first()
    if not doctor:
        doctor = User(
            id=uuid.uuid4(),
            email="doctor_test_2130@drishti.ai",
            hashed_password="pw",
            full_name="Dr. Test Ophthalmologist",
            role=UserRole.OPHTHALMOLOGIST,
            is_active=True,
        )
        db_session.add(doctor)

    hw = db_session.query(User).filter(User.email == "hw_test_2130@drishti.ai").first()
    if not hw:
        hw = User(
            id=uuid.uuid4(),
            email="hw_test_2130@drishti.ai",
            hashed_password="pw",
            full_name="Health Worker Test",
            role=UserRole.HEALTH_WORKER,
            is_active=True,
        )
        db_session.add(hw)

    db_session.commit()
    db_session.refresh(doctor)
    db_session.refresh(hw)

    doc_token = create_access_token({"sub": str(doctor.id), "role": doctor.role.value})
    hw_token = create_access_token({"sub": str(hw.id), "role": hw.role.value})

    return {
        "doctor": {"Authorization": f"Bearer {doc_token}"},
        "health_worker": {"Authorization": f"Bearer {hw_token}"},
        "doctor_user": doctor,
        "hw_user": hw,
    }


@pytest.fixture
def test_patient(db_session):
    p = Patient(
        id=uuid.uuid4(),
        patient_code=f"DX-TEST-{uuid.uuid4().hex[:8].upper()}",
        name="Longitudinal Test Patient",
        age=58,
        gender=Gender.FEMALE,
        diabetes_type="Type 2",
        diabetes_duration_years=12,
        is_anonymous=False,
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


# ── Feature 22: Priority Scoring Engine ────────────────────────
def test_priority_scoring_engine_calculation():
    service = PriorityScoringService()

    # Severe case with mismatch -> CRITICAL
    crit = service.calculate_priority(
        predicted_grade=4,
        confidence=0.92,
        assurance_decision="HUMAN_REVIEW_REQUIRED",
        mismatch_detected=True,
        lesion_summary={"microaneurysms": {"count": 25, "retinal_coverage_pct": 0.4}},
        quality_score=78.0,
    )
    assert crit["priority_level"] == "CRITICAL"
    assert crit["priority_score"] >= 70.0
    assert len(crit["priority_factors"]) > 0
    assert crit["priority_rule_version"] == "1.0.0"

    # Mild case without mismatch -> ROUTINE / MEDIUM
    routine = service.calculate_priority(
        predicted_grade=0,
        confidence=0.95,
        assurance_decision="VALIDATED",
        mismatch_detected=False,
        lesion_summary={"microaneurysms": {"count": 0, "retinal_coverage_pct": 0.0}},
        quality_score=90.0,
    )
    assert routine["priority_level"] in ("ROUTINE", "MEDIUM")
    assert routine["priority_score"] < 50.0


# ── Feature 21: Priority Referral Queue Endpoints ───────────────
def test_priority_referral_queue_endpoints(client, auth_headers, test_patient, db_session):
    # Create two test screenings: one CRITICAL, one ROUTINE
    s1 = Screening(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        created_by=auth_headers["hw_user"].id,
        status=ScreeningStatus.HUMAN_REVIEW_REQUIRED,
        case_number="DX-CASE-202610-CRIT01",
        priority_level="CRITICAL",
        priority_score=85.0,
        is_referable=True,
    )
    s2 = Screening(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        created_by=auth_headers["hw_user"].id,
        status=ScreeningStatus.RECAPTURE_REQUIRED,
        case_number="DX-CASE-202610-RECAP1",
        priority_level="ROUTINE",
        priority_score=15.0,
        is_referable=False,
    )
    db_session.add_all([s1, s2])
    db_session.commit()

    # Query referral queue with review filter
    resp = client.get(
        "/api/dashboard/referral-queue?queue_type=review",
        headers=auth_headers["doctor"],
    )
    assert resp.status_code == 200
    cases = resp.json()
    assert isinstance(cases, list)
    assert any(c["case_number"] == "DX-CASE-202610-CRIT01" for c in cases)

    # Query referral queue with recapture filter
    resp_recap = client.get(
        "/api/dashboard/referral-queue?queue_type=recapture",
        headers=auth_headers["doctor"],
    )
    assert resp_recap.status_code == 200
    recap_cases = resp_recap.json()
    assert any(c["case_number"] == "DX-CASE-202610-RECAP1" for c in recap_cases)

    # Test priority filter
    resp_crit = client.get(
        "/api/dashboard/referral-queue?priority=CRITICAL",
        headers=auth_headers["doctor"],
    )
    assert resp_crit.status_code == 200
    crit_cases = resp_crit.json()
    assert all(c["priority_level"] == "CRITICAL" for c in crit_cases)


# ── Feature 23 & 24: Doctor Review Actions & Human-in-the-Loop ─
def test_doctor_review_actions_lifecycle(client, auth_headers, test_patient, db_session):
    screening = Screening(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        created_by=auth_headers["hw_user"].id,
        status=ScreeningStatus.HUMAN_REVIEW_REQUIRED,
        case_number="DX-CASE-202610-ACT001",
        priority_level="HIGH",
        priority_score=65.0,
    )
    db_session.add(screening)
    db_session.commit()

    # 1. Health Worker attempting doctor action -> 403 Forbidden
    hw_resp = client.post(
        f"/api/screenings/{screening.id}/review-action",
        json={"action": "ACCEPT", "doctor_grade": 2, "notes": "Unauthorized"},
        headers=auth_headers["health_worker"],
    )
    assert hw_resp.status_code == 403

    # 2. Doctor action: REVIEW_FURTHER
    rev_resp = client.post(
        f"/api/screenings/{screening.id}/review-action",
        json={"action": "REVIEW_FURTHER", "notes": "Requesting OCT correlate"},
        headers=auth_headers["doctor"],
    )
    assert rev_resp.status_code == 200
    data = rev_resp.json()
    assert data["action"] == "REVIEW_FURTHER"
    assert data["new_status"] == "IN_REVIEW"

    # Verify screening status in DB
    db_session.refresh(screening)
    assert screening.status == ScreeningStatus.IN_REVIEW

    # 3. Doctor action: REFER
    refer_resp = client.post(
        f"/api/screenings/{screening.id}/review-action",
        json={
            "action": "REFER",
            "notes": "Referral to tertiary hospital",
            "referral_destination": "Apex Eye Institute",
            "referral_urgency": "HIGH"
        },
        headers=auth_headers["doctor"],
    )
    assert refer_resp.status_code == 200
    assert refer_resp.json()["new_status"] == "REFERRED"

    # 4. Doctor action: ACCEPT
    accept_resp = client.post(
        f"/api/screenings/{screening.id}/review-action",
        json={"action": "ACCEPT", "doctor_grade": 2, "notes": "Diagnosis verified"},
        headers=auth_headers["doctor"],
    )
    assert accept_resp.status_code == 200
    assert accept_resp.json()["new_status"] == "REVIEWED"

    # 5. Get review action audit history
    history_resp = client.get(
        f"/api/screenings/{screening.id}/review-actions",
        headers=auth_headers["doctor"],
    )
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history) == 3
    actions = [h["action"] for h in history]
    assert actions == ["REVIEW_FURTHER", "REFER", "ACCEPT"]


# ── Feature 25: Patient History & Longitudinal Comparison ──────
def test_patient_history_and_comparison(client, auth_headers, test_patient, db_session):
    # Create two screenings for test patient
    s_base = Screening(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        created_by=auth_headers["hw_user"].id,
        status=ScreeningStatus.REVIEWED,
        case_number="DX-CASE-202601-BASE01",
        created_at=datetime(2026, 1, 15, tzinfo=timezone.utc),
    )
    p_base = Prediction(
        screening_id=s_base.id,
        predicted_grade=1,
        grade_label="Mild NPDR",
        confidence=0.88,
    )

    s_follow = Screening(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        created_by=auth_headers["hw_user"].id,
        status=ScreeningStatus.REVIEWED,
        case_number="DX-CASE-202606-FOLL01",
        created_at=datetime(2026, 6, 20, tzinfo=timezone.utc),
    )
    p_follow = Prediction(
        screening_id=s_follow.id,
        predicted_grade=2,
        grade_label="Moderate NPDR",
        confidence=0.91,
    )

    db_session.add_all([s_base, p_base, s_follow, p_follow])
    db_session.commit()

    # 1. Patient history endpoint
    hist_resp = client.get(
        f"/api/patients/{test_patient.id}/screenings",
        headers=auth_headers["doctor"],
    )
    assert hist_resp.status_code == 200
    h_data = hist_resp.json()
    assert h_data["total_screenings"] >= 2
    assert "screenings" in h_data

    # 2. Longitudinal compare endpoint
    comp_resp = client.get(
        f"/api/patients/{test_patient.id}/compare?screening1_id={s_base.id}&screening2_id={s_follow.id}",
        headers=auth_headers["doctor"],
    )
    assert comp_resp.status_code == 200
    c_data = comp_resp.json()
    assert c_data["interval_days"] > 100
    assert c_data["progression"]["ai_progression"] == "PROGRESSED"
    assert "disclaimer" in c_data
    assert "biomicroscopy" in c_data["disclaimer"]


# ── Feature 26: 17-Section PDF Screening Report ────────────────
def test_pdf_report_generation(tmp_path):
    report_data = {
        "report_id": "RPT-TEST-2130",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "screening": {
            "case_number": "DX-CASE-202610-PDF001",
            "eye_side": "LEFT",
            "priority_level": "CRITICAL",
            "priority_score": 82.5,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "REVIEWED",
        },
        "patient": {
            "patient_code": "DX-PAT-9999",
            "name": "Report Validation Patient",
            "age": 62,
            "gender": "MALE",
            "diabetes_type": "Type 2",
            "diabetes_duration_years": 15,
            "hba1c_value": 8.4,
        },
        "image_quality": {
            "quality_score": 85.0,
            "is_gradable": True,
            "focus_score": 88.0,
            "illumination_score": 82.0,
            "fov_score": 90.0,
        },
        "ai_prediction": {
            "predicted_grade": 3,
            "grade_label": "Severe NPDR",
            "confidence": 0.94,
            "calibrated": True,
            "temperature": 1.25,
            "is_referable": True,
            "probabilities": {"0": 0.01, "1": 0.03, "2": 0.06, "3": 0.85, "4": 0.05},
            "lesion_summary": {
                "microaneurysms": {"count": 18, "total_area_px": 140.0, "retinal_coverage_pct": 0.12},
                "hemorrhages": {"count": 12, "total_area_px": 420.0, "retinal_coverage_pct": 0.35},
                "hard_exudates": {"count": 6, "total_area_px": 280.0, "retinal_coverage_pct": 0.20},
                "lesion_evidence_score": 0.85,
            },
            "concordance_level": "HIGH_AGREEMENT",
            "concordance_score": 0.88,
            "mismatch_detected": False,
        },
        "assurance": {
            "decision": "VALIDATED",
            "referral_priority": "CRITICAL",
            "referral_score": 82.5,
            "is_referable": True,
            "reasons": ["Concordance verified across microvascular findings."],
        },
        "doctor_review": {
            "doctor_grade": 3,
            "ai_grade_accepted": True,
            "doctor_notes": "Prompt retina clinic referral initiated.",
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        },
    }

    out_pdf = str(tmp_path / "test_report.pdf")
    res_path = generate_pdf_report(report_data, out_pdf)
    assert os.path.exists(res_path)
    assert os.path.getsize(res_path) > 1000  # Non-empty PDF with binary tables


# ── Feature 27 & 29: Analysis Job Lifecycle & Status Endpoint ──
def test_analysis_job_lifecycle_and_endpoint(client, auth_headers, test_patient, db_session):
    scr = Screening(
        id=uuid.uuid4(),
        patient_id=test_patient.id,
        created_by=auth_headers["hw_user"].id,
        status=ScreeningStatus.PENDING,
    )
    db_session.add(scr)
    db_session.commit()

    # 1. Query job status before analysis
    resp_init = client.get(
        f"/api/screenings/{scr.id}/job-status",
        headers=auth_headers["doctor"],
    )
    assert resp_init.status_code == 200
    assert resp_init.json()["status"] == "NOT_STARTED"

    # 2. Test AnalysisJobService methods
    job = AnalysisJobService.create_or_get_job(db_session, scr.id, engine="PYTHON_EFFICIENTNET")
    assert job.status == JobStatus.RUNNING
    assert job.stage == "IMAGE_VALIDATION"

    # Progress to inference stage
    AnalysisJobService.update_stage(db_session, job.id, "CLASSIFICATION_INFERENCE")
    resp_running = client.get(
        f"/api/screenings/{scr.id}/job-status",
        headers=auth_headers["doctor"],
    )
    assert resp_running.status_code == 200
    assert resp_running.json()["stage"] == "CLASSIFICATION_INFERENCE"
    assert resp_running.json()["progress_percent"] == 60.0

    # Complete job
    AnalysisJobService.complete_job(db_session, job.id, result_summary={"predicted_grade": 2})
    resp_done = client.get(
        f"/api/screenings/{scr.id}/job-status",
        headers=auth_headers["doctor"],
    )
    assert resp_done.status_code == 200
    assert resp_done.json()["is_completed"] is True
    assert resp_done.json()["progress_percent"] == 100.0


# ── Feature 28: MATLAB Diagnostics & Connection Check ──────────
def test_matlab_endpoints(client, auth_headers):
    # Status endpoint
    resp = client.get("/api/engine/matlab/status", headers=auth_headers["doctor"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["connection_status"] in ("NOT_CONFIGURED", "INSTALLED_NOT_CONNECTED", "CONNECTED")
    assert data["active_fallback_engine"] == "PYTHON_EFFICIENTNET"
    assert "setup_guide" in data

    # Test connection endpoint
    test_resp = client.post("/api/engine/matlab/test-connection", headers=auth_headers["doctor"])
    assert test_resp.status_code == 200
    t_data = test_resp.json()
    assert "connected" in t_data
    assert "notice" in t_data


# ── Feature 30: Structured Failure and Error Handling ──────────
def test_structured_error_responses(client, auth_headers):
    # 1. 404 Not Found
    random_id = uuid.uuid4()
    resp_404 = client.get(f"/api/screenings/{random_id}", headers=auth_headers["doctor"])
    assert resp_404.status_code == 404
    err_404 = resp_404.json()
    assert err_404["status_code"] == 404
    assert err_404["error_code"] == "ERR_RESOURCE_NOT_FOUND"
    assert err_404["reference_id"].startswith("ERR-")
    assert "timestamp" in err_404
    assert err_404["retryable"] is False

    # 2. 403 Forbidden
    resp_403 = client.post(
        f"/api/screenings/{random_id}/review-action",
        json={"action": "ACCEPT"},
        headers=auth_headers["health_worker"],
    )
    assert resp_403.status_code == 403
    err_403 = resp_403.json()
    assert err_403["status_code"] == 403
    assert err_403["error_code"] == "ERR_FORBIDDEN_ROLE"
    assert err_403["reference_id"].startswith("ERR-")

    # 3. 422 Unprocessable Entity
    resp_422 = client.post(
        "/api/screenings",
        json={"eye_side": "INVALID_DATA"}, # missing required patient_id
        headers=auth_headers["health_worker"],
    )
    assert resp_422.status_code == 422
    err_422 = resp_422.json()
    assert err_422["status_code"] == 422
    assert err_422["error_code"] == "ERR_VALIDATION_FAILED"
    assert err_422["reference_id"].startswith("ERR-")
