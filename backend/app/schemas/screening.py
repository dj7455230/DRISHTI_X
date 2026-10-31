from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
from app.models.screening import (
    ScreeningStatus, AssuranceDecision, ReferralPriority, ReferralStatus
)
from app.schemas.patient import PatientCreate, PatientOut


class ScreeningCreate(BaseModel):
    patient_id: uuid.UUID
    eye_side: Optional[str] = "RIGHT"
    screening_purpose: Optional[str] = "ROUTINE_DR_SCREENING"
    screening_notes: Optional[str] = None
    referral_source: Optional[str] = None
    facility_name: Optional[str] = None
    operator_name: Optional[str] = None
    clinical_context: Optional[Dict[str, Any]] = None


class ScreeningUpdate(BaseModel):
    eye_side: Optional[str] = None
    screening_purpose: Optional[str] = None
    screening_notes: Optional[str] = None
    referral_source: Optional[str] = None
    facility_name: Optional[str] = None
    operator_name: Optional[str] = None
    clinical_context: Optional[Dict[str, Any]] = None


class QualityResult(BaseModel):
    quality_score: float
    focus_score: float
    illumination_score: float
    contrast_score: Optional[float] = None
    fov_score: float
    is_gradable: bool
    quality_category: Optional[str] = "Good"
    quality_status: Optional[str] = "GRADABLE"
    quality_warnings: List[str] = []
    detected_issues: Optional[List[Dict[str, Any]]] = []
    recapture_guidance: List[str] = []
    feedback: str
    quality_engine_version: Optional[str] = "2.1.0"
    processed_at: Optional[str] = None
    detail: Dict[str, Any] = {}


class QualityCheckResponse(BaseModel):
    screening_id: uuid.UUID
    quality: QualityResult
    is_gradable: bool
    quality_status: str
    quality_category: Optional[str] = "Good"
    action_required: str
    detected_issues: Optional[List[Dict[str, Any]]] = []
    recapture_guidance: List[str] = []


class LesionSummary(BaseModel):
    microaneurysm_count: int = 0
    microaneurysm_area: float = 0.0
    hemorrhage_count: int = 0
    hemorrhage_area: float = 0.0
    exudate_count: int = 0
    exudate_area: float = 0.0
    neovascularization_detected: bool = False
    lesion_evidence_score: float = 0.0
    provenance: str = "NOT_AVAILABLE"   # model name or algorithm


class PredictionOut(BaseModel):
    predicted_grade: int
    grade_label: str
    confidence: float
    probabilities: Dict[str, float]
    is_referable: bool
    model_name: str
    model_version: str
    model_status: str
    is_demo: bool
    gradcam_path: Optional[str] = None
    lesion_summary: Optional[LesionSummary] = None
    concordance_score: Optional[float] = None
    concordance_level: Optional[str] = None
    mismatch_detected: bool = False
    mismatch_details: Optional[List[str]] = None

    model_config = {"from_attributes": True}


class AssuranceResult(BaseModel):
    decision: AssuranceDecision
    reasons: List[str]
    referral_priority: ReferralPriority
    referral_score: float


class DoctorReviewCreate(BaseModel):
    doctor_grade: int
    doctor_notes: Optional[str] = None
    ai_grade_accepted: bool
    recapture_requested: bool = False
    recapture_reason: Optional[str] = None
    heatmap_usefulness: Optional[str] = None  # HIGHLY_USEFUL | MODERATELY_USEFUL | MISLEADING | NOT_USEFUL
    quality_assessment_agreed: Optional[bool] = None
    disagreement_reasons: Optional[List[str]] = None


class DoctorReviewOut(BaseModel):
    id: uuid.UUID
    doctor_grade: Optional[int]
    doctor_grade_label: Optional[str]
    doctor_notes: Optional[str]
    ai_grade_accepted: Optional[bool]
    ai_grade_modified: bool
    recapture_requested: bool
    recapture_reason: Optional[str] = None
    heatmap_usefulness: Optional[str] = None
    quality_assessment_agreed: Optional[bool] = None
    disagreement_reasons: Optional[List[str]] = None
    reviewed_at: datetime

    model_config = {"from_attributes": True}


class ReferralCreate(BaseModel):
    screening_id: uuid.UUID
    patient_id: uuid.UUID
    urgency: Optional[ReferralPriority] = ReferralPriority.MEDIUM
    referred_facility: Optional[str] = None
    appointment_date: Optional[datetime] = None
    follow_up_date: Optional[datetime] = None
    clinical_notes: Optional[str] = None


class ReferralUpdate(BaseModel):
    status: Optional[ReferralStatus] = None
    urgency: Optional[ReferralPriority] = None
    referred_facility: Optional[str] = None
    appointment_date: Optional[datetime] = None
    follow_up_date: Optional[datetime] = None
    clinical_notes: Optional[str] = None
    outcome_notes: Optional[str] = None
    assigned_to: Optional[uuid.UUID] = None


class ReferralOut(BaseModel):
    id: uuid.UUID
    screening_id: uuid.UUID
    patient_id: uuid.UUID
    referred_by: uuid.UUID
    assigned_to: Optional[uuid.UUID] = None
    status: ReferralStatus
    urgency: ReferralPriority
    referred_facility: Optional[str] = None
    appointment_date: Optional[datetime] = None
    follow_up_date: Optional[datetime] = None
    clinical_notes: Optional[str] = None
    outcome_notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SyncBatchItem(BaseModel):
    client_case_id: str
    patient_age: Optional[int] = 50
    gender: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    eye_side: Optional[str] = "RIGHT"
    image_base64: Optional[str] = None
    captured_at: Optional[datetime] = None


class SyncBatchRequest(BaseModel):
    cases: List[SyncBatchItem]


class SyncBatchResultItem(BaseModel):
    client_case_id: str
    server_screening_id: Optional[str] = None
    status: str
    message: str


class SyncBatchResponse(BaseModel):
    synced_count: int
    failed_count: int
    results: List[SyncBatchResultItem]


class ScreeningOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    status: ScreeningStatus
    eye_side: Optional[str] = None
    screening_purpose: Optional[str] = None
    screening_notes: Optional[str] = None
    referral_source: Optional[str] = None
    facility_name: Optional[str] = None
    operator_name: Optional[str] = None
    assurance_decision: Optional[AssuranceDecision] = None
    is_referable: Optional[bool] = None
    referral_priority: Optional[ReferralPriority] = None
    referral_score: Optional[float] = None
    is_synced: bool = True
    created_at: datetime
    analyzed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ScreeningDetail(ScreeningOut):
    prediction: Optional[PredictionOut] = None
    doctor_review: Optional[DoctorReviewOut] = None
    quality: Optional[QualityResult] = None


class AnalysisResponse(BaseModel):
    screening_id: uuid.UUID
    prediction: PredictionOut
    quality: QualityResult
    assurance: AssuranceResult
    warnings: List[str] = []


class ScreeningIntakeRequest(BaseModel):
    # Patient registration or reuse
    patient_id: Optional[uuid.UUID] = None
    patient: Optional[PatientCreate] = None

    # Screening parameters
    eye_side: Optional[str] = "RIGHT"
    screening_purpose: Optional[str] = "ROUTINE_DR_SCREENING"
    screening_notes: Optional[str] = None
    referral_source: Optional[str] = None
    facility_name: Optional[str] = None
    operator_name: Optional[str] = None
    clinical_context: Optional[Dict[str, Any]] = None


class ScreeningIntakeResponse(BaseModel):
    patient: PatientOut
    screening: ScreeningOut

