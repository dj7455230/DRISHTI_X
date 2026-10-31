"""
DRISHTI-X — Screening Routes
POST /api/screenings               — create screening
POST /api/screenings/{id}/image    — upload fundus image
POST /api/screenings/{id}/analyze  — run full AI pipeline
GET  /api/screenings/{id}          — get screening detail
GET  /api/screenings/{id}/evidence — get evidence summary
POST /api/screenings/{id}/doctor-review — submit doctor review
POST /api/screenings/{id}/recapture     — request recapture
GET  /api/screenings               — list screenings
"""
import uuid
import os
import shutil
import hashlib
import secrets
import string
from datetime import datetime, timezone
from typing import Annotated, List, Optional
from fastapi import (APIRouter, Depends, HTTPException, UploadFile, File,
                     BackgroundTasks, Query)
from sqlalchemy.orm import Session
from PIL import Image
import io

from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.patient import Patient
from app.models.screening import (
    Screening, FundusImage, Prediction, DoctorReview, Referral,
    ScreeningStatus, AssuranceDecision, ReferralPriority, ReferralStatus,
    DoctorReviewAction, AnalysisJob, JobStatus
)
from app.models.audit import AuditLog
from app.schemas.screening import (
    ScreeningCreate, ScreeningUpdate, ScreeningOut, ScreeningDetail,
    DoctorReviewCreate, DoctorReviewOut, AnalysisResponse,
    QualityResult, PredictionOut, AssuranceResult, LesionSummary,
    QualityCheckResponse, ReferralCreate, ReferralUpdate, ReferralOut,
    SyncBatchRequest, SyncBatchResponse, SyncBatchResultItem,
    ScreeningIntakeRequest, ScreeningIntakeResponse,
    ReviewActionCreate, ReviewActionOut, AnalysisJobOut
)
from app.api.deps import get_current_user, require_doctor
from app.core.config import settings
from ai.reliability.reliability_engine import evaluate_ai_reliability
from app.api.routes.patients import generate_patient_code
from datetime import date

router = APIRouter(prefix="/api/screenings", tags=["Screenings"])

UPLOAD_DIR = settings.UPLOAD_DIR


def generate_case_number() -> str:
    """Generate unique non-guessable case number: DX-CASE-YYYYMM-XXXXXX"""
    now_str = datetime.now(timezone.utc).strftime("%Y%m")
    chars = string.ascii_uppercase + string.digits
    rand_suffix = "".join(secrets.choice(chars) for _ in range(6))
    return f"DX-CASE-{now_str}-{rand_suffix}"


def _get_screening_or_404(screening_id: uuid.UUID, db: Session) -> Screening:
    s = db.query(Screening).filter(Screening.id == screening_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Screening not found.")
    return s


def _audit(db: Session, user_id, screening_id, action: str,
           detail: str = None, old_val=None, new_val=None,
           model_version: str = None):
    db.add(AuditLog(
        user_id=user_id,
        screening_id=screening_id,
        action=action,
        resource_type="screening",
        resource_id=str(screening_id),
        detail=detail,
        old_value=old_val,
        new_value=new_val,
        model_version=model_version,
    ))


# ----------------------------------------------------------------
# ATOMIC SCREENING INTAKE (Patient + Screening in one transaction)
# ----------------------------------------------------------------
@router.post("/intake", response_model=ScreeningIntakeResponse, status_code=201)
def intake_screening(
    payload: ScreeningIntakeRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Atomic screening intake endpoint.
    Registers or resolves a patient AND initializes the screening record in a single atomic transaction.
    If any step fails, changes roll back immediately, preventing orphaned records.
    """
    try:
        # Step 1: Resolve or Create Patient
        patient = None
        if payload.patient_id is not None:
            patient = db.query(Patient).filter(Patient.id == payload.patient_id).first()
            if not patient:
                raise HTTPException(status_code=404, detail=f"Patient {payload.patient_id} not found.")
        elif payload.patient is not None:
            # Validate patient creation inputs
            p_data = payload.patient
            if not p_data.is_anonymous and not (p_data.name and p_data.name.strip()):
                raise HTTPException(
                    status_code=422,
                    detail="Patient name is required when registration is not anonymous."
                )

            code = generate_patient_code()
            while db.query(Patient).filter(Patient.patient_code == code).first():
                code = generate_patient_code()

            computed_age = p_data.age
            if computed_age is None and p_data.date_of_birth is not None:
                today = date.today()
                computed_age = today.year - p_data.date_of_birth.year - (
                    (today.month, today.day) < (p_data.date_of_birth.month, p_data.date_of_birth.day)
                )

            patient = Patient(
                patient_code=code,
                name=p_data.name.strip() if (p_data.name and not p_data.is_anonymous) else None,
                age=computed_age,
                date_of_birth=p_data.date_of_birth,
                gender=p_data.gender,
                contact_number=p_data.contact_number.strip() if (p_data.contact_number and not p_data.is_anonymous) else None,
                address=p_data.address.strip() if (p_data.address and not p_data.is_anonymous) else None,
                is_anonymous=p_data.is_anonymous or False,
                diabetes_type=p_data.diabetes_type,
                diabetes_duration_years=p_data.diabetes_duration_years,
                diabetes_treatment=p_data.diabetes_treatment,
                hba1c_value=p_data.hba1c_value,
                hba1c_unit=p_data.hba1c_unit or "%",
                hba1c_date=p_data.hba1c_date,
                blood_glucose_value=p_data.blood_glucose_value,
                blood_glucose_unit=p_data.blood_glucose_unit or "mg/dL",
                blood_glucose_type=p_data.blood_glucose_type,
                history_of_dr=p_data.history_of_dr,
                last_retinal_exam_date=p_data.last_retinal_exam_date,
                previous_eye_treatment=p_data.previous_eye_treatment,
                relevant_eye_conditions=p_data.relevant_eye_conditions,
                visual_symptoms=p_data.visual_symptoms,
                symptom_onset=p_data.symptom_onset,
                pregnancy_status=p_data.pregnancy_status,
                clinical_history=p_data.clinical_history,
                facility_code=p_data.facility_code or current_user.facility_name,
                district=p_data.district or current_user.facility_location,
                state=p_data.state,
                notes=p_data.notes,
            )
            db.add(patient)
            db.flush()
        else:
            raise HTTPException(
                status_code=422,
                detail="Either patient_id (for existing patient) or patient registration object is required."
            )

        # Step 2: Create Screening Record linked to resolved Patient
        screening = Screening(
            case_number=generate_case_number(),
            patient_id=patient.id,
            created_by=current_user.id,
            eye_side=payload.eye_side or "RIGHT",
            screening_purpose=payload.screening_purpose or "ROUTINE_DR_SCREENING",
            screening_notes=payload.screening_notes,
            referral_source=payload.referral_source,
            facility_name=payload.facility_name or current_user.facility_name or "Primary Health Centre",
            operator_name=payload.operator_name or current_user.full_name or current_user.email or "Community Health Worker",
            clinical_context=payload.clinical_context,
            status=ScreeningStatus.PENDING,
        )
        db.add(screening)
        db.flush()

        # Step 3: Record Audit Entry
        _audit(
            db,
            current_user.id,
            screening.id,
            "SCREENING_INTAKE_COMPLETED",
            detail=f"Screening intake initialized for patient {patient.patient_code} ({screening.eye_side})"
        )

        db.commit()
        db.refresh(patient)
        db.refresh(screening)
        return ScreeningIntakeResponse(patient=patient, screening=screening)

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Screening intake transaction failed: {str(exc)}"
        )


# ----------------------------------------------------------------
# CREATE SCREENING (Stand-alone endpoint)
# ----------------------------------------------------------------
@router.post("", response_model=ScreeningOut, status_code=201)
def create_screening(
    payload: ScreeningCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    try:
        patient = db.query(Patient).filter(Patient.id == payload.patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found.")

        screening = Screening(
            case_number=generate_case_number(),
            patient_id=payload.patient_id,
            created_by=current_user.id,
            eye_side=payload.eye_side or "RIGHT",
            screening_purpose=payload.screening_purpose or "ROUTINE_DR_SCREENING",
            screening_notes=payload.screening_notes,
            referral_source=payload.referral_source,
            facility_name=payload.facility_name or current_user.facility_name,
            operator_name=payload.operator_name or current_user.full_name or current_user.email,
            clinical_context=payload.clinical_context,
            status=ScreeningStatus.PENDING,
        )
        db.add(screening)
        db.flush()
        _audit(db, current_user.id, screening.id, "SCREENING_CREATED",
               detail=f"Screening created for patient {patient.patient_code}")
        db.commit()
        db.refresh(screening)
        return screening
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create screening: {str(exc)}")



@router.patch("/{screening_id}", response_model=ScreeningOut)
def update_screening(
    screening_id: uuid.UUID,
    payload: ScreeningUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Update draft screening parameters such as eye examined, clinical notes, or facility."""
    screening = _get_screening_or_404(screening_id, db)
    update_data = payload.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(screening, key, val)
    db.commit()
    db.refresh(screening)
    return screening


# ----------------------------------------------------------------
# OFFLINE BATCH SYNC
# ----------------------------------------------------------------
@router.post("/sync", response_model=SyncBatchResponse)
def sync_offline_screenings(
    payload: SyncBatchRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    import base64
    results = []
    synced_count = 0
    failed_count = 0

    for case in payload.cases:
        try:
            # 1. Resolve or create patient
            patient_rec = Patient(
                name=f"Offline Patient ({case.client_case_id[:8]})",
                age=case.patient_age or 50,
                gender=case.gender or "UNKNOWN",
                district=case.district or "Rural Screening Camp",
                state=case.state or "Uttar Pradesh",
                created_by=current_user.id,
            )
            db.add(patient_rec)
            db.flush()

            # 2. Decode image if provided
            img_bytes = None
            img_hash = None
            ext = ".jpg"
            if case.image_base64:
                raw_b64 = case.image_base64
                if "," in raw_b64:
                    raw_b64 = raw_b64.split(",", 1)[1]
                img_bytes = base64.b64decode(raw_b64)
                img_hash = hashlib.sha256(img_bytes).hexdigest()

                # Check duplicate
                existing_fundus = db.query(FundusImage).filter(
                    FundusImage.image_hash == img_hash
                ).first()
                if existing_fundus:
                    results.append(SyncBatchResultItem(
                        client_case_id=case.client_case_id,
                        server_screening_id=str(existing_fundus.screening_id),
                        status="ALREADY_EXISTS",
                        message="Case image already exists on server.",
                    ))
                    synced_count += 1
                    continue

            # 3. Create Screening
            new_screening = Screening(
                patient_id=patient_rec.id,
                created_by=current_user.id,
                eye_side=case.eye_side or "RIGHT",
                status=ScreeningStatus.IMAGE_UPLOADED if img_bytes else ScreeningStatus.PENDING,
                offline_captured=True,
                is_synced=True,
                created_at=case.captured_at or datetime.now(timezone.utc),
            )
            db.add(new_screening)
            db.flush()

            # 4. Save image to disk and create FundusImage
            if img_bytes:
                save_dir = os.path.join(UPLOAD_DIR, str(new_screening.id))
                os.makedirs(save_dir, exist_ok=True)
                orig_path = os.path.join(save_dir, f"original{ext}")
                with open(orig_path, "wb") as f:
                    f.write(img_bytes)

                thumb_path = os.path.join(save_dir, "thumbnail.jpg")
                try:
                    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                    w, h = img.size
                    img.thumbnail((256, 256))
                    img.save(thumb_path, "JPEG", quality=85)
                except Exception:
                    thumb_path = None
                    w, h = None, None

                fundus = FundusImage(
                    screening_id=new_screening.id,
                    original_path=orig_path,
                    thumbnail_path=thumb_path,
                    original_filename=f"{case.client_case_id}.jpg",
                    file_size_bytes=len(img_bytes),
                    image_width=w,
                    image_height=h,
                    image_hash=img_hash,
                    image_format="jpg",
                )
                db.add(fundus)

            _audit(db, current_user.id, new_screening.id, "OFFLINE_SYNC",
                   detail=f"Synced from client case {case.client_case_id}")
            db.commit()

            results.append(SyncBatchResultItem(
                client_case_id=case.client_case_id,
                server_screening_id=str(new_screening.id),
                status="SYNCED",
                message="Successfully synced to server.",
            ))
            synced_count += 1
        except Exception as ex:
            db.rollback()
            results.append(SyncBatchResultItem(
                client_case_id=case.client_case_id,
                server_screening_id=None,
                status="FAILED",
                message=str(ex),
            ))
            failed_count += 1

    return SyncBatchResponse(
        synced_count=synced_count,
        failed_count=failed_count,
        results=results,
    )


# ----------------------------------------------------------------
# CLINICIAN FEEDBACK ANALYTICS & EXPORT
# ----------------------------------------------------------------
@router.get("/feedback/analytics")
def get_feedback_analytics(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    reviews = db.query(DoctorReview).all()
    total_reviews = len(reviews)
    if total_reviews == 0:
        return {
            "total_reviews": 0,
            "ai_agreement_count": 0,
            "ai_agreement_rate": 0.0,
            "ai_modified_count": 0,
            "ai_modified_rate": 0.0,
            "heatmap_usefulness_breakdown": {
                "HIGHLY_USEFUL": 0,
                "MODERATELY_USEFUL": 0,
                "MISLEADING": 0,
                "NOT_USEFUL": 0,
            },
            "quality_agreement_count": 0,
            "top_disagreement_reasons": {},
            "clinical_governance_notice": (
                "Continuous automated retraining in production is disabled to adhere to "
                "regulatory safety guidelines. Feedback is archived for offline expert audit."
            ),
        }

    agreed = sum(1 for r in reviews if r.ai_grade_accepted is True)
    modified = sum(1 for r in reviews if r.ai_grade_modified is True)
    quality_agreed = sum(1 for r in reviews if r.quality_assessment_agreed is True)

    heatmap_counts = {"HIGHLY_USEFUL": 0, "MODERATELY_USEFUL": 0, "MISLEADING": 0, "NOT_USEFUL": 0}
    for r in reviews:
        if r.heatmap_usefulness and r.heatmap_usefulness in heatmap_counts:
            heatmap_counts[r.heatmap_usefulness] += 1

    disagreement_counts = {}
    for r in reviews:
        if r.disagreement_reasons and isinstance(r.disagreement_reasons, list):
            for reason in r.disagreement_reasons:
                disagreement_counts[reason] = disagreement_counts.get(reason, 0) + 1

    return {
        "total_reviews": total_reviews,
        "ai_agreement_count": agreed,
        "ai_agreement_rate": round(agreed / total_reviews, 3),
        "ai_modified_count": modified,
        "ai_modified_rate": round(modified / total_reviews, 3),
        "heatmap_usefulness_breakdown": heatmap_counts,
        "quality_agreement_count": quality_agreed,
        "top_disagreement_reasons": disagreement_counts,
        "clinical_governance_notice": (
            "Continuous automated retraining in production is disabled to adhere to "
            "regulatory safety guidelines. Feedback is archived for offline expert audit."
        ),
    }


@router.get("/feedback/export")
def export_feedback(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    format: str = Query("json", enum=["json", "csv"]),
):
    reviews = db.query(DoctorReview).all()
    rows = []
    for r in reviews:
        pred = db.query(Prediction).filter(Prediction.screening_id == r.screening_id).first()
        rows.append({
            "review_id": str(r.id),
            "screening_id": str(r.screening_id),
            "reviewer_id": str(r.reviewer_id),
            "ai_predicted_grade": pred.predicted_grade if pred else None,
            "ai_confidence": pred.confidence if pred else None,
            "doctor_grade": r.doctor_grade,
            "ai_grade_accepted": r.ai_grade_accepted,
            "ai_grade_modified": r.ai_grade_modified,
            "heatmap_usefulness": r.heatmap_usefulness,
            "quality_assessment_agreed": r.quality_assessment_agreed,
            "disagreement_reasons": r.disagreement_reasons or [],
            "doctor_notes": r.doctor_notes,
            "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        })

    if format == "csv":
        import io
        import csv
        from fastapi.responses import Response
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            for row in rows:
                row_copy = dict(row)
                row_copy["disagreement_reasons"] = "; ".join(row_copy["disagreement_reasons"])
                writer.writerow(row_copy)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=clinician_feedback_export.csv"},
        )

    return {"reviews": rows, "count": len(rows)}


# ----------------------------------------------------------------
# UPLOAD IMAGE
# ----------------------------------------------------------------
@router.post("/{screening_id}/image", status_code=200)
async def upload_image(
    screening_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    screening = _get_screening_or_404(screening_id, db)

    # Read file bytes
    file_bytes = await file.read()

    # Validate
    from ai.quality.quality_engine import validate_image_file
    is_valid, err = validate_image_file(file_bytes, file.filename or "upload")
    if not is_valid:
        raise HTTPException(status_code=422, detail=f"Invalid image: {err}")

    # Save original
    save_dir = os.path.join(UPLOAD_DIR, str(screening_id))
    os.makedirs(save_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "upload.jpg")[1].lower() or ".jpg"
    original_path = os.path.join(save_dir, f"original{ext}")
    with open(original_path, "wb") as f:
        f.write(file_bytes)

    # Thumbnail
    thumb_path = os.path.join(save_dir, "thumbnail.jpg")
    try:
        img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        img.thumbnail((256, 256))
        img.save(thumb_path, "JPEG", quality=85)
    except Exception:
        thumb_path = None

    # File hash
    img_hash = hashlib.sha256(file_bytes).hexdigest()

    # Image dimensions
    try:
        img = Image.open(io.BytesIO(file_bytes))
        w, h = img.size
    except Exception:
        w, h = None, None

    # Upsert FundusImage record
    fundus = db.query(FundusImage).filter(
        FundusImage.screening_id == screening_id
    ).first()
    if fundus:
        fundus.original_path = original_path
        fundus.thumbnail_path = thumb_path
        fundus.original_filename = file.filename
        fundus.file_size_bytes = len(file_bytes)
        fundus.image_width = w
        fundus.image_height = h
        fundus.image_hash = img_hash
        fundus.image_format = ext.lstrip(".")
    else:
        fundus = FundusImage(
            screening_id=screening_id,
            original_path=original_path,
            thumbnail_path=thumb_path,
            original_filename=file.filename,
            file_size_bytes=len(file_bytes),
            image_width=w,
            image_height=h,
            image_hash=img_hash,
            image_format=ext.lstrip("."),
        )
        db.add(fundus)

    screening.status = ScreeningStatus.IMAGE_UPLOADED
    _audit(db, current_user.id, screening_id, "IMAGE_UPLOADED",
           detail=f"Image uploaded: {file.filename}, {len(file_bytes)} bytes")
    db.commit()

    return {
        "screening_id": str(screening_id),
        "status": "IMAGE_UPLOADED",
        "image_hash": img_hash,
        "dimensions": f"{w}x{h}" if w and h else "unknown",
        "message": "Image uploaded successfully. Call /analyze to run AI pipeline.",
    }


# ----------------------------------------------------------------
# INSTANT QUALITY CHECK (PRE-INFERENCE QUALITY GATE)
# ----------------------------------------------------------------
@router.post("/{screening_id}/quality-check", response_model=QualityCheckResponse)
def check_image_quality(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    screening = _get_screening_or_404(screening_id, db)
    fundus = db.query(FundusImage).filter(FundusImage.screening_id == screening_id).first()
    if not fundus or not fundus.original_path or not os.path.exists(fundus.original_path):
        raise HTTPException(status_code=422, detail="No fundus image uploaded yet.")

    from ai.quality.quality_engine import assess_image_quality
    with open(fundus.original_path, "rb") as f:
        img_bytes = f.read()

    quality_res = assess_image_quality(img_bytes)
    fundus.quality_score = quality_res["quality_score"]
    fundus.focus_score = quality_res["focus_score"]
    fundus.illumination_score = quality_res["illumination_score"]
    fundus.fov_score = quality_res["fov_score"]
    fundus.is_gradable = quality_res["is_gradable"]
    fundus.quality_feedback = quality_res["feedback"]
    fundus.quality_detail = {
        **quality_res.get("detail", {}),
        "quality_status": quality_res.get("quality_status"),
        "quality_warnings": quality_res.get("quality_warnings", []),
        "recapture_guidance": quality_res.get("recapture_guidance", []),
    }

    if not quality_res["is_gradable"]:
        screening.status = ScreeningStatus.RECAPTURE_REQUIRED
        screening.assurance_decision = AssuranceDecision.RECAPTURE_REQUIRED
        screening.assurance_reasons = quality_res.get("quality_warnings", ["Image ungradable"])
        action_required = "RECAPTURE_REQUIRED"
    else:
        action_required = "PROCEED_TO_ANALYSIS"

    _audit(db, current_user.id, screening_id, "QUALITY_GATE_CHECK",
           detail=f"Score={quality_res['quality_score']}, Gradable={quality_res['is_gradable']}")
    db.commit()

    return {
        "screening_id": screening_id,
        "quality": quality_res,
        "is_gradable": quality_res["is_gradable"],
        "quality_status": quality_res.get("quality_status", "GRADABLE"),
        "quality_category": quality_res.get("quality_category", "Good" if quality_res["is_gradable"] else "Poor"),
        "action_required": action_required,
        "detected_issues": quality_res.get("detected_issues", []),
        "recapture_guidance": quality_res.get("recapture_guidance", []),
    }


# ----------------------------------------------------------------
# RUN ANALYSIS
# ----------------------------------------------------------------
@router.post("/{screening_id}/analyze")
async def analyze_screening(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    screening = _get_screening_or_404(screening_id, db)
    fundus = db.query(FundusImage).filter(
        FundusImage.screening_id == screening_id
    ).first()

    if not fundus or not fundus.original_path:
        raise HTTPException(
            status_code=422,
            detail="No image uploaded. Upload an image first via /image endpoint."
        )

    if not os.path.exists(fundus.original_path):
        raise HTTPException(
            status_code=422,
            detail="Image file not found on disk. Please re-upload."
        )

    # Run pipeline — always resolve weights path fresh
    from ai.inference.inference_service import InferenceService
    import ai.inference.inference_service as _inf_mod

    weights_path = os.path.join(settings.model_weights_path, "best_model.pth")
    wp = weights_path if os.path.exists(weights_path) else None

    # Reset singleton if model became available since last startup
    if (_inf_mod._service is not None and
            not _inf_mod._service.loader.is_ready_for_real_inference() and
            wp is not None):
        _inf_mod._service = None

    # Track persistent analysis job (Features 27 & 29)
    from app.services.analysis_job_service import AnalysisJobService
    job = AnalysisJobService.create_or_get_job(db, screening_id, engine="PYTHON_EFFICIENTNET")
    AnalysisJobService.update_stage(db, job.id, "MODEL_LOADING", progress_percent=50.0)

    from ai.inference.inference_service import get_inference_service
    service = get_inference_service(weights_path=wp)

    save_dir = os.path.join(UPLOAD_DIR, str(screening_id))
    AnalysisJobService.update_stage(db, job.id, "CLASSIFICATION_INFERENCE", progress_percent=60.0)
    result = service.run_full_pipeline(
        image_path=fundus.original_path,
        screening_id=str(screening_id),
        save_dir=save_dir,
    )
    AnalysisJobService.update_stage(db, job.id, "CLINICAL_ASSURANCE", progress_percent=95.0)

    # Update FundusImage quality
    quality = result.get("quality", {})
    fundus.quality_score = quality.get("quality_score")
    fundus.focus_score = quality.get("focus_score")
    fundus.illumination_score = quality.get("illumination_score")
    fundus.fov_score = quality.get("fov_score")
    fundus.is_gradable = quality.get("is_gradable", False)
    fundus.quality_feedback = quality.get("feedback")
    fundus.quality_detail = {
        **quality.get("detail", {}),
        "quality_status": quality.get("quality_status"),
        "quality_warnings": quality.get("quality_warnings", []),
        "recapture_guidance": quality.get("recapture_guidance", []),
    }

    if result.get("assurance_decision") == "RECAPTURE_REQUIRED":
        if not screening.case_number:
            screening.case_number = generate_case_number()
        screening.status = ScreeningStatus.RECAPTURE_REQUIRED
        screening.assurance_decision = AssuranceDecision.RECAPTURE_REQUIRED
        screening.assurance_reasons = result.get("assurance_reasons", [])
        screening.priority_level = result.get("priority_level", "ROUTINE")
        screening.priority_score = result.get("priority_score", 0.0)
        screening.priority_factors = result.get("priority_factors", [])
        screening.priority_rule_version = result.get("priority_rule_version", "1.0.0")
        screening.priority_calculated_at = datetime.now(timezone.utc)
        AnalysisJobService.complete_job(db, job.id, result_summary={"status": "RECAPTURE_REQUIRED", "quality_score": quality.get("quality_score")})
        db.commit()
        return {
            "screening_id": str(screening_id),
            "case_number": screening.case_number,
            "status": "RECAPTURE_REQUIRED",
            "quality": quality,
            "quality_status": quality.get("quality_status", "UNGRADABLE"),
            "quality_warnings": quality.get("quality_warnings", []),
            "recapture_guidance": quality.get("recapture_guidance", []),
            "assurance_decision": "RECAPTURE_REQUIRED",
            "priority_level": screening.priority_level,
            "priority_score": screening.priority_score,
            "priority_factors": screening.priority_factors,
            "priority_rule_version": screening.priority_rule_version,
            "reasons": result.get("assurance_reasons", []),
            "model_status": result.get("model_status"),
            "warnings": result.get("warnings", []),
            "model": {
                "name": result.get("model_name", "EfficientNet-B0"),
                "version": result.get("model_version", "1.0.0"),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    # Upsert Prediction
    prediction = db.query(Prediction).filter(
        Prediction.screening_id == screening_id
    ).first()
    if not prediction:
        prediction = Prediction(screening_id=screening_id)
        db.add(prediction)

    prediction.predicted_grade = result.get("predicted_grade")
    prediction.grade_label = result.get("grade_label")
    prediction.confidence = result.get("confidence")
    prediction.probabilities = result.get("probabilities")
    prediction.is_referable = result.get("is_referable")
    prediction.model_name = result.get("model_name", "EfficientNet-B0")
    prediction.model_version = result.get("model_version", "0.0.0")
    prediction.model_status = result.get("model_status", "NOT_TRAINED")
    prediction.weights_hash = result.get("weights_hash")
    prediction.training_dataset = result.get("training_dataset")
    prediction.is_demo = result.get("is_demo", True)
    prediction.gradcam_path = result.get("gradcam_path")
    prediction.gradcam_target_layer = result.get("gradcam_target_layer")
    prediction.lesion_mask_path = result.get("lesion_mask_path")
    prediction.lesion_summary = result.get("lesion_summary")
    if result.get("lesion_summary"):
        prediction.lesion_evidence_score = result["lesion_summary"].get(
            "lesion_evidence_score"
        )
    prediction.concordance_score = result.get("concordance_score")
    prediction.concordance_level = result.get("concordance_level")
    prediction.mismatch_detected = result.get("mismatch_detected", False)
    prediction.mismatch_details = result.get("mismatch_details")

    # Update screening status
    if not screening.case_number:
        screening.case_number = generate_case_number()
    assurance = result.get("assurance_decision", "HUMAN_REVIEW_REQUIRED")
    screening.assurance_decision = AssuranceDecision(assurance)
    screening.assurance_reasons = result.get("assurance_reasons", [])
    screening.is_referable = result.get("is_referable")
    screening.referral_score = result.get("referral_score")
    if result.get("referral_priority"):
        screening.referral_priority = ReferralPriority(result["referral_priority"])
    screening.priority_level = result.get("priority_level", "ROUTINE")
    screening.priority_score = result.get("priority_score", 0.0)
    screening.priority_factors = result.get("priority_factors", [])
    screening.priority_rule_version = result.get("priority_rule_version", "1.0.0")
    if result.get("priority_calculated_at"):
        try:
            screening.priority_calculated_at = datetime.fromisoformat(result["priority_calculated_at"])
        except Exception:
            screening.priority_calculated_at = datetime.now(timezone.utc)
    else:
        screening.priority_calculated_at = datetime.now(timezone.utc)
    screening.analyzed_at = datetime.now(timezone.utc)

    if assurance == "HUMAN_REVIEW_REQUIRED":
        screening.status = ScreeningStatus.HUMAN_REVIEW_REQUIRED
    else:
        screening.status = ScreeningStatus.ANALYZED

    _audit(
        db, current_user.id, screening_id,
        "AI_PREDICTION",
        detail=f"Grade={result.get('predicted_grade')} "
               f"Confidence={result.get('confidence')} "
               f"ModelStatus={result.get('model_status')}",
        new_val={
            "predicted_grade": result.get("predicted_grade"),
            "confidence": result.get("confidence"),
            "model_status": result.get("model_status"),
            "is_demo": result.get("is_demo"),
        },
        model_version=result.get("model_version"),
    )
    AnalysisJobService.complete_job(
        db, job.id,
        result_summary={
            "predicted_grade": result.get("predicted_grade"),
            "grade_label": result.get("grade_label"),
            "priority_level": screening.priority_level,
            "priority_score": screening.priority_score,
        }
    )
    db.commit()

    # Calculate multi-factor AI reliability
    reliability = evaluate_ai_reliability(
        quality=quality,
        prediction=result,
        lesion_summary=result.get("lesion_summary"),
        concordance_level=result.get("concordance_level"),
    )

    heatmap_rel_url = (
        f"/uploads/{screening_id}/heatmap.jpg"
        if os.path.exists(os.path.join(save_dir, "heatmap.jpg"))
        else (f"/uploads/{screening_id}/gradcam.jpg" if result.get("gradcam_path") else None)
    )
    overlay_rel_url = f"/uploads/{screening_id}/gradcam.jpg" if result.get("gradcam_path") else None
    lesion_mask_url = (
        f"/uploads/{screening_id}/lesion_mask.jpg"
        if os.path.exists(os.path.join(save_dir, "lesion_mask.jpg"))
        else None
    )

    return {
        "screening_id": str(screening_id),
        "case_number": screening.case_number,
        "status": screening.status.value,
        "priority_level": screening.priority_level,
        "priority_score": screening.priority_score,
        "priority_factors": screening.priority_factors,
        "priority_rule_version": screening.priority_rule_version,
        "model_status": result.get("model_status"),
        "is_demo": result.get("is_demo"),
        "predicted_grade": result.get("predicted_grade"),
        "grade_label": result.get("grade_label"),
        "confidence": result.get("confidence"),
        "confidence_type": "calibrated_confidence" if result.get("calibrated") else "uncalibrated_probability",
        "probabilities": result.get("probabilities"),
        "class_probabilities": result.get("probabilities"),
        "is_referable": result.get("is_referable"),
        "quality": quality,
        "reliability": reliability,
        "explainability": {
            "available": bool(result.get("gradcam_path")),
            "heatmap_url": heatmap_rel_url,
            "overlay_url": overlay_rel_url,
            "method": "Grad-CAM",
            "target_layer": result.get("gradcam_target_layer"),
        },
        "model": {
            "name": result.get("model_name", "EfficientNet-B0"),
            "version": result.get("model_version", "1.0.0"),
            "status": result.get("model_status"),
        },
        "timestamp": (screening.analyzed_at or datetime.now(timezone.utc)).isoformat(),
        "lesion_summary": result.get("lesion_summary"),
        "lesion_mask_url": lesion_mask_url,
        "gradcam_path": result.get("gradcam_path"),
        "gradcam_overlay_path": result.get("gradcam_overlay_path"),
        "gradcam_heatmap_path": result.get("gradcam_heatmap_path"),
        "gradcam_target_layer": result.get("gradcam_target_layer"),
        "assurance_decision": assurance,
        "assurance_reasons": result.get("assurance_reasons", []),
        "concordance_level": result.get("concordance_level"),
        "mismatch_detected": result.get("mismatch_detected", False),
        "referral_priority": result.get("referral_priority"),
        "referral_score": result.get("referral_score"),
        "calibrated": result.get("calibrated"),
        "temperature": result.get("temperature"),
        "warnings": result.get("warnings", []),
        "errors": result.get("errors", []),
    }


# ----------------------------------------------------------------
# LIVE ANALYSIS JOB STATUS (Features 27 & 29)
# ----------------------------------------------------------------
@router.get("/{screening_id}/job-status")
def get_analysis_job_status(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 29: Live 11-stage progress tracker and execution monitor.
    """
    _get_screening_or_404(screening_id, db)
    from app.services.analysis_job_service import AnalysisJobService
    return AnalysisJobService.get_job_status(db, screening_id)


# ----------------------------------------------------------------
# GET SCREENING
# ----------------------------------------------------------------
@router.get("/{screening_id}", response_model=ScreeningOut)
def get_screening(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return _get_screening_or_404(screening_id, db)


# ----------------------------------------------------------------
# LIST SCREENINGS
# ----------------------------------------------------------------
@router.get("", response_model=List[ScreeningOut])
def list_screenings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    query = db.query(Screening)
    if status:
        query = query.filter(Screening.status == status)
    return query.order_by(Screening.created_at.desc()).offset(skip).limit(limit).all()


# ----------------------------------------------------------------
# DOCTOR REVIEW
# ----------------------------------------------------------------
@router.post("/{screening_id}/doctor-review", response_model=DoctorReviewOut)
def submit_doctor_review(
    screening_id: uuid.UUID,
    payload: DoctorReviewCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_doctor)],
):
    screening = _get_screening_or_404(screening_id, db)

    dr_labels = {
        0: "No DR", 1: "Mild NPDR", 2: "Moderate NPDR",
        3: "Severe NPDR", 4: "Proliferative DR"
    }

    review = db.query(DoctorReview).filter(
        DoctorReview.screening_id == screening_id
    ).first()
    if not review:
        review = DoctorReview(
            screening_id=screening_id,
            reviewer_id=current_user.id,
        )
        db.add(review)

    # Record doctor's INDEPENDENT assessment
    review.doctor_grade = payload.doctor_grade
    review.doctor_grade_label = dr_labels.get(payload.doctor_grade)
    review.doctor_is_referable = payload.doctor_grade >= 2
    review.doctor_notes = payload.doctor_notes
    review.ai_grade_accepted = payload.ai_grade_accepted
    review.recapture_requested = payload.recapture_requested
    review.recapture_reason = payload.recapture_reason
    review.heatmap_usefulness = payload.heatmap_usefulness
    review.quality_assessment_agreed = payload.quality_assessment_agreed
    review.disagreement_reasons = payload.disagreement_reasons

    # Check if doctor modified the AI grade
    prediction = db.query(Prediction).filter(
        Prediction.screening_id == screening_id
    ).first()
    if prediction and prediction.predicted_grade is not None:
        review.ai_grade_modified = (payload.doctor_grade != prediction.predicted_grade)

    screening.status = ScreeningStatus.REVIEWED
    if payload.recapture_requested:
        screening.status = ScreeningStatus.RECAPTURE_REQUIRED

    _audit(
        db, current_user.id, screening_id,
        "DOCTOR_REVIEW",
        detail=f"Doctor grade={payload.doctor_grade}, "
               f"AI accepted={payload.ai_grade_accepted}",
        old_val={"ai_grade": prediction.predicted_grade if prediction else None},
        new_val={"doctor_grade": payload.doctor_grade},
    )
    AnalysisJobService.complete_job(
        db, job.id,
        result_summary={
            "predicted_grade": result.get("predicted_grade"),
            "grade_label": result.get("grade_label"),
            "priority_level": screening.priority_level,
            "priority_score": screening.priority_score,
        }
    )
    db.commit()
    db.refresh(review)
    return review


# ----------------------------------------------------------------
# DOCTOR REVIEW ACTIONS (Features 23 & 24)
# ----------------------------------------------------------------
@router.post("/{screening_id}/review-action", response_model=ReviewActionOut)
def record_doctor_review_action(
    screening_id: uuid.UUID,
    payload: ReviewActionCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_doctor)],
):
    """
    Feature 23 & 24: Ophthalmologist review actions.
    Supports ACCEPT, REVIEW_FURTHER, REFER, RECAPTURE.
    Auditable, non-destructive to AI predictions, and maintains full action history.
    """
    screening = _get_screening_or_404(screening_id, db)
    old_status = screening.status.value if hasattr(screening.status, "value") else str(screening.status)

    action_type = payload.action.upper()
    allowed_actions = ["ACCEPT", "REVIEW_FURTHER", "REFER", "RECAPTURE"]
    if action_type not in allowed_actions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid review action: '{payload.action}'. Allowed: {', '.join(allowed_actions)}"
        )

    dr_labels = {
        0: "No DR", 1: "Mild NPDR", 2: "Moderate NPDR",
        3: "Severe NPDR", 4: "Proliferative DR"
    }

    prediction = db.query(Prediction).filter(Prediction.screening_id == screening_id).first()
    ai_grade = prediction.predicted_grade if prediction else None

    # Handle specific action outcomes
    if action_type == "ACCEPT":
        new_status = ScreeningStatus.REVIEWED
        screening.status = new_status

        # Upsert DoctorReview
        review = db.query(DoctorReview).filter(DoctorReview.screening_id == screening_id).first()
        if not review:
            review = DoctorReview(screening_id=screening_id, reviewer_id=current_user.id)
            db.add(review)

        grade_to_set = payload.doctor_grade if payload.doctor_grade is not None else ai_grade
        review.doctor_grade = grade_to_set
        review.doctor_grade_label = dr_labels.get(grade_to_set)
        review.doctor_is_referable = (grade_to_set is not None and grade_to_set >= 2)
        review.doctor_notes = payload.notes
        review.ai_grade_accepted = (grade_to_set == ai_grade) if ai_grade is not None else True
        review.ai_grade_modified = (grade_to_set != ai_grade) if (grade_to_set is not None and ai_grade is not None) else False
        review.recapture_requested = False

    elif action_type == "REVIEW_FURTHER":
        new_status = ScreeningStatus.IN_REVIEW
        screening.status = new_status

        review = db.query(DoctorReview).filter(DoctorReview.screening_id == screening_id).first()
        if not review:
            review = DoctorReview(screening_id=screening_id, reviewer_id=current_user.id)
            db.add(review)
        if payload.notes:
            review.doctor_notes = payload.notes

    elif action_type == "REFER":
        new_status = ScreeningStatus.REFERRED
        screening.status = new_status

        # Map urgency string to ReferralPriority enum
        urgency_str = (payload.referral_urgency or "MEDIUM").upper()
        try:
            urgency_enum = ReferralPriority(urgency_str)
        except Exception:
            urgency_enum = ReferralPriority.MEDIUM

        referral = db.query(Referral).filter(Referral.screening_id == screening_id).first()
        if not referral:
            referral = Referral(
                screening_id=screening_id,
                patient_id=screening.patient_id,
                referred_by=current_user.id,
                status=ReferralStatus.PENDING_REVIEW,
                urgency=urgency_enum,
                referred_facility=payload.referral_destination,
                follow_up_date=payload.follow_up_date,
                clinical_notes=payload.notes,
            )
            db.add(referral)
        else:
            referral.referred_by = current_user.id
            referral.urgency = urgency_enum
            referral.referred_facility = payload.referral_destination
            referral.follow_up_date = payload.follow_up_date
            if payload.notes:
                referral.clinical_notes = payload.notes

    elif action_type == "RECAPTURE":
        new_status = ScreeningStatus.RECAPTURE_REQUIRED
        screening.status = new_status
        screening.assurance_decision = AssuranceDecision.RECAPTURE_REQUIRED
        reason = payload.recapture_reason or payload.notes or "Doctor requested image recapture."
        existing_reasons = screening.assurance_reasons or []
        screening.assurance_reasons = list(existing_reasons) + [reason]

        review = db.query(DoctorReview).filter(DoctorReview.screening_id == screening_id).first()
        if not review:
            review = DoctorReview(screening_id=screening_id, reviewer_id=current_user.id)
            db.add(review)
        review.recapture_requested = True
        review.recapture_reason = reason
        if payload.notes:
            review.doctor_notes = payload.notes

    new_status_val = new_status.value if hasattr(new_status, "value") else str(new_status)

    # Create immutable audit record
    action_record = DoctorReviewAction(
        screening_id=screening_id,
        reviewer_id=current_user.id,
        action=action_type,
        previous_status=old_status,
        new_status=new_status_val,
        doctor_grade=payload.doctor_grade,
        doctor_grade_label=dr_labels.get(payload.doctor_grade),
        notes=payload.notes,
        referral_destination=payload.referral_destination,
        referral_urgency=payload.referral_urgency,
        follow_up_date=payload.follow_up_date,
    )
    db.add(action_record)

    _audit(
        db, current_user.id, screening_id,
        f"DOCTOR_ACTION_{action_type}",
        detail=f"Action: {action_type}, old_status: {old_status}, new_status: {new_status_val}, notes: {payload.notes}"
    )

    db.commit()
    db.refresh(action_record)
    return action_record


@router.get("/{screening_id}/review-actions", response_model=List[ReviewActionOut])
def get_screening_review_actions(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 23 & 24: Chronological review action history for a screening.
    """
    _get_screening_or_404(screening_id, db)
    return db.query(DoctorReviewAction).filter(
        DoctorReviewAction.screening_id == screening_id
    ).order_by(DoctorReviewAction.created_at.asc()).all()


# ----------------------------------------------------------------
# REQUEST RECAPTURE
# ----------------------------------------------------------------
@router.post("/{screening_id}/recapture")
def request_recapture(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    reason: str = "Recapture requested",
):
    screening = _get_screening_or_404(screening_id, db)
    screening.status = ScreeningStatus.RECAPTURE_REQUIRED
    screening.assurance_decision = AssuranceDecision.RECAPTURE_REQUIRED
    screening.assurance_reasons = [reason, "Image quality or clinical review required new capture."]

    # Record or update DoctorReview if review exists
    review = db.query(DoctorReview).filter(
        DoctorReview.screening_id == screening_id
    ).first()
    if not review:
        review = DoctorReview(
            screening_id=screening_id,
            reviewer_id=current_user.id,
        )
        db.add(review)

    review.recapture_requested = True
    review.recapture_reason = reason

    _audit(db, current_user.id, screening_id, "RECAPTURE_REQUESTED",
           detail=reason)
    db.commit()
    return {
        "screening_id": str(screening_id),
        "status": "RECAPTURE_REQUIRED",
        "assurance_decision": "RECAPTURE_REQUIRED",
        "reason": reason,
    }


# ----------------------------------------------------------------
# SCREENING REFERRAL
# ----------------------------------------------------------------
@router.post("/{screening_id}/referral", response_model=ReferralOut)
def create_or_update_screening_referral(
    screening_id: uuid.UUID,
    payload: ReferralCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    screening = _get_screening_or_404(screening_id, db)
    ref = db.query(Referral).filter(Referral.screening_id == screening_id).first()
    if not ref:
        ref = Referral(
            screening_id=screening_id,
            patient_id=payload.patient_id or screening.patient_id,
            referred_by=current_user.id,
            status=ReferralStatus.PENDING_REVIEW,
            urgency=payload.urgency or screening.referral_priority or ReferralPriority.MEDIUM,
            referred_facility=payload.referred_facility,
            appointment_date=payload.appointment_date,
            follow_up_date=payload.follow_up_date,
            clinical_notes=payload.clinical_notes,
        )
        db.add(ref)
    else:
        if payload.urgency:
            ref.urgency = payload.urgency
        if payload.referred_facility:
            ref.referred_facility = payload.referred_facility
        if payload.appointment_date:
            ref.appointment_date = payload.appointment_date
        if payload.follow_up_date:
            ref.follow_up_date = payload.follow_up_date
        if payload.clinical_notes:
            ref.clinical_notes = payload.clinical_notes

    screening.status = ScreeningStatus.REFERRED
    _audit(db, current_user.id, screening_id, "REFERRAL_CREATED",
           detail=f"Facility={ref.referred_facility}, Urgency={ref.urgency}")
    db.commit()
    db.refresh(ref)
    return ref


@router.get("/{screening_id}/referral", response_model=Optional[ReferralOut])
def get_screening_referral(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    ref = db.query(Referral).filter(Referral.screening_id == screening_id).first()
    return ref


# ----------------------------------------------------------------
# PROTOTYPE DEMONSTRATION / DATASET TEST IMAGES
# ----------------------------------------------------------------
@router.get("/demo/sample-images")
def get_demo_sample_images(current_user: Annotated[User, Depends(get_current_user)]):
    """
    Returns curated demonstration fundus images from APTOS 2019, IDRiD, and Messidor-2
    for controlled prototype testing. Clearly marked as demonstration prototypes.
    """
    samples = [
        {
            "id": "aptos_sample_1",
            "dataset": "APTOS 2019",
            "image_id": "000c1434d8d7",
            "filename": "000c1434d8d7.png",
            "description": "APTOS 2019 Blindness Detection Test Sample",
            "known_grade": 2,
            "known_label": "Moderate Diabetic Retinopathy",
            "is_demo": True,
            "url": "/api/screenings/demo/sample-image-file/aptos_sample_1",
        },
        {
            "id": "idrid_sample_1",
            "dataset": "IDRiD",
            "image_id": "IDRiD_001",
            "filename": "IDRiD_001.jpg",
            "description": "IDRiD Indian Diabetic Retinopathy Image Dataset Sample",
            "known_grade": 3,
            "known_label": "Severe Diabetic Retinopathy",
            "is_demo": True,
            "url": "/api/screenings/demo/sample-image-file/idrid_sample_1",
        },
        {
            "id": "messidor2_sample_1",
            "dataset": "Messidor-2",
            "image_id": "20051020_43808_0100_PP",
            "filename": "20051020_43808_0100_PP.png",
            "description": "Messidor-2 External Validation Cohort Sample",
            "known_grade": 0,
            "known_label": "No Apparent Diabetic Retinopathy",
            "is_demo": True,
            "url": "/api/screenings/demo/sample-image-file/messidor2_sample_1",
        },
    ]
    return {
        "disclaimer": "DEMONSTRATION ONLY: Dataset images are provided for prototype testing and must not be treated as real clinical diagnoses.",
        "samples": samples,
    }


@router.get("/demo/sample-image-file/{sample_key}")
def get_demo_sample_file(
    sample_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    from fastapi.responses import FileResponse
    import pathlib
    root = pathlib.Path(__file__).parent.parent.parent.parent.parent

    path_map = {
        "aptos_sample_1": root / "datasets/aptos2019/train_images/000c1434d8d7.png",
        "idrid_sample_1": root / "datasets/idrid/B. Disease Grading/1. Original Images/a. Training Set/IDRiD_001.jpg",
        "messidor2_sample_1": root / "datasets/messidor2/archive/messidor-2/messidor-2/preprocess/20051020_43808_0100_PP.png",
    }
    file_path = path_map.get(sample_key)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Sample demonstration image not found.")

    media_type = "image/png" if file_path.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(path=str(file_path), media_type=media_type, filename=file_path.name)


# ----------------------------------------------------------------
# ADVANCED RETINAL INTELLIGENCE (FEATURES 11-19)
# ----------------------------------------------------------------

@router.post("/{screening_id}/segment")
def run_lesion_segmentation(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 11 & 12: Trigger genuine U-Net retinal lesion segmentation.
    Generates pixel-level masks for Microaneurysms, Haemorrhages, and Hard Exudates.
    """
    screening = _get_screening_or_404(screening_id, db)
    fundus = db.query(FundusImage).filter(FundusImage.screening_id == screening_id).first()
    if not fundus or not fundus.original_path or not os.path.exists(fundus.original_path):
        raise HTTPException(status_code=422, detail="No fundus image found on disk for segmentation.")

    from ai.segmentation.lesion_segmentation_service import LesionSegmentationService
    service = LesionSegmentationService()
    if not service.is_available():
        raise HTTPException(status_code=503, detail="U-Net model weights (models/weights/unet_lesion.pth) unavailable.")

    save_dir = os.path.join(UPLOAD_DIR, str(screening_id))
    try:
        seg_res = service.segment_image(
            image_path=fundus.original_path,
            output_dir=save_dir,
        )
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(ex)}")

    prediction = db.query(Prediction).filter(Prediction.screening_id == screening_id).first()
    if not prediction:
        prediction = Prediction(screening_id=screening_id)
        db.add(prediction)

    prediction.lesion_summary = seg_res
    composite_filename = seg_res.get("files", {}).get("composite_mask", "lesion_mask.png")
    prediction.lesion_mask_path = os.path.join(save_dir, composite_filename)
    if "lesion_evidence_score" in seg_res:
        prediction.lesion_evidence_score = seg_res["lesion_evidence_score"]

    db.commit()

    return {
        "screening_id": str(screening_id),
        "status": "SEGMENTED",
        "model": seg_res.get("model"),
        "supported_classes": seg_res.get("supported_classes"),
        "unsupported_classes": seg_res.get("unsupported_classes"),
        "lesion_summary": seg_res,
        "urls": {
            "composite_mask": f"/uploads/{screening_id}/{composite_filename}",
            "blended_overlay": f"/uploads/{screening_id}/{seg_res.get('files', {}).get('blended_overlay', 'lesion_overlay.jpg')}",
            "microaneurysms_mask": f"/uploads/{screening_id}/mask_microaneurysm.png",
            "hemorrhages_mask": f"/uploads/{screening_id}/mask_hemorrhage.png",
            "hard_exudates_mask": f"/uploads/{screening_id}/mask_hard_exudate.png",
        },
        "disclaimer": seg_res.get("disclaimer"),
    }


@router.get("/{screening_id}/lesion-evidence")
def get_lesion_evidence(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 12: Get lesion evidence map data and region measurements.
    """
    screening = _get_screening_or_404(screening_id, db)
    pred = db.query(Prediction).filter(Prediction.screening_id == screening_id).first()
    if not pred or not pred.lesion_summary:
        raise HTTPException(status_code=404, detail="No lesion segmentation data available for this screening.")

    summary = pred.lesion_summary
    return {
        "screening_id": str(screening_id),
        "lesion_summary": summary,
        "mask_path": pred.lesion_mask_path,
        "urls": {
            "composite_mask": f"/uploads/{screening_id}/lesion_mask.png",
            "blended_overlay": f"/uploads/{screening_id}/lesion_overlay.jpg",
            "microaneurysms_mask": f"/uploads/{screening_id}/mask_microaneurysm.png",
            "hemorrhages_mask": f"/uploads/{screening_id}/mask_hemorrhage.png",
            "hard_exudates_mask": f"/uploads/{screening_id}/mask_hard_exudate.png",
        },
        "disclaimer": summary.get("disclaimer", "Lesion candidates require clinical verification."),
    }


@router.post("/{screening_id}/gradcam")
def run_gradcam_explanation(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    target_class: Optional[int] = Query(None, ge=0, le=4),
    alpha: float = Query(0.45, ge=0.0, le=1.0),
):
    """
    Feature 13: Compute real Grad-CAM explainability from EfficientNet-B0.
    """
    screening = _get_screening_or_404(screening_id, db)
    fundus = db.query(FundusImage).filter(FundusImage.screening_id == screening_id).first()
    if not fundus or not fundus.original_path or not os.path.exists(fundus.original_path):
        raise HTTPException(status_code=422, detail="No fundus image found on disk for Grad-CAM.")

    from ai.explainability.gradcam_service import GradCAMService
    service = GradCAMService()
    if not service.is_available():
        raise HTTPException(status_code=503, detail="EfficientNet-B0 model weights unavailable.")

    save_dir = os.path.join(UPLOAD_DIR, str(screening_id))
    try:
        gradcam_res = service.generate_explanation(
            image_path=fundus.original_path,
            output_dir=save_dir,
            target_class=target_class,
            alpha=alpha,
        )
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Grad-CAM generation failed: {str(ex)}")

    prediction = db.query(Prediction).filter(Prediction.screening_id == screening_id).first()
    if prediction:
        prediction.gradcam_path = os.path.join(save_dir, "gradcam_overlay.jpg")
        prediction.gradcam_target_layer = gradcam_res.get("model", {}).get("target_layer", "backbone.features.8.0")
        db.commit()

    return {
        "screening_id": str(screening_id),
        "target_class": gradcam_res.get("target_class"),
        "grade_label": gradcam_res.get("grade_label"),
        "class_activation_score": gradcam_res.get("class_activation_score"),
        "target_layer": gradcam_res.get("model", {}).get("target_layer"),
        "blend_alpha": alpha,
        "urls": {
            "heatmap": f"/uploads/{screening_id}/gradcam_heatmap.jpg",
            "overlay": f"/uploads/{screening_id}/gradcam_overlay.jpg",
        },
        "disclaimer": gradcam_res.get("disclaimer"),
    }


@router.get("/{screening_id}/explainability")
def get_explainability(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 13 & 14: Get explainability metadata and visual artifacts.
    """
    screening = _get_screening_or_404(screening_id, db)
    pred = db.query(Prediction).filter(Prediction.screening_id == screening_id).first()
    fundus = db.query(FundusImage).filter(FundusImage.screening_id == screening_id).first()

    save_dir = os.path.join(UPLOAD_DIR, str(screening_id))
    has_heatmap = os.path.exists(os.path.join(save_dir, "gradcam_heatmap.jpg"))
    has_overlay = os.path.exists(os.path.join(save_dir, "gradcam_overlay.jpg")) or os.path.exists(os.path.join(save_dir, "gradcam.jpg"))

    return {
        "screening_id": str(screening_id),
        "available": has_overlay or has_heatmap,
        "target_layer": pred.gradcam_target_layer if pred else "backbone.features.8.0",
        "predicted_grade": pred.predicted_grade if pred else None,
        "grade_label": pred.grade_label if pred else None,
        "urls": {
            "original": f"/uploads/{screening_id}/{os.path.basename(fundus.original_path)}" if fundus and fundus.original_path else None,
            "heatmap": f"/uploads/{screening_id}/gradcam_heatmap.jpg" if has_heatmap else None,
            "overlay": f"/uploads/{screening_id}/gradcam_overlay.jpg" if has_overlay else None,
            "lesion_mask": f"/uploads/{screening_id}/lesion_mask.png" if os.path.exists(os.path.join(save_dir, "lesion_mask.png")) else None,
            "lesion_overlay": f"/uploads/{screening_id}/lesion_overlay.jpg" if os.path.exists(os.path.join(save_dir, "lesion_overlay.jpg")) else None,
        },
        "disclaimer": "Grad-CAM saliency and U-Net segmentations are AI aids and require clinical verification.",
    }


@router.get("/{screening_id}/concordance")
def get_evidence_concordance(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 15: Run and get Evidence Concordance evaluation.
    """
    screening = _get_screening_or_404(screening_id, db)
    pred = db.query(Prediction).filter(Prediction.screening_id == screening_id).first()
    if not pred:
        raise HTTPException(status_code=404, detail="No prediction found for this screening.")

    from ai.assurance.evidence_concordance_service import EvidenceConcordanceService
    service = EvidenceConcordanceService()
    result = service.evaluate(
        predicted_grade=pred.predicted_grade,
        confidence=pred.confidence or 0.8,
        lesion_summary=pred.lesion_summary,
    )
    return {
        "screening_id": str(screening_id),
        "predicted_grade": pred.predicted_grade,
        "grade_label": pred.grade_label,
        **result,
    }


@router.get("/{screening_id}/mismatches")
def get_grade_lesion_mismatches(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 16: Check for Grade-Lesion Mismatches (MISMATCH_R01 - MISMATCH_R06).
    """
    screening = _get_screening_or_404(screening_id, db)
    pred = db.query(Prediction).filter(Prediction.screening_id == screening_id).first()
    if not pred:
        raise HTTPException(status_code=404, detail="No prediction found for this screening.")

    from ai.assurance.mismatch_detection_service import MismatchDetectionService
    service = MismatchDetectionService()
    result = service.detect_mismatches(
        predicted_grade=pred.predicted_grade,
        confidence=pred.confidence or 0.8,
        lesion_summary=pred.lesion_summary,
        gradcam_metadata={
            "target_class": pred.predicted_grade,
            "class_activation_score": pred.confidence or 0.8,
        },
    )
    return {
        "screening_id": str(screening_id),
        "predicted_grade": pred.predicted_grade,
        **result,
    }


@router.get("/{screening_id}/assurance")
def get_clinical_assurance(
    screening_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Features 17, 18, 19: Full Clinical Assurance assessment and auditable reasons.
    """
    screening = _get_screening_or_404(screening_id, db)
    pred = db.query(Prediction).filter(Prediction.screening_id == screening_id).first()
    fundus = db.query(FundusImage).filter(FundusImage.screening_id == screening_id).first()

    from ai.assurance.clinical_assurance_service import ClinicalAssuranceService
    service = ClinicalAssuranceService()
    result = service.evaluate(
        predicted_grade=pred.predicted_grade if pred else None,
        confidence=pred.confidence if pred else 0.5,
        quality_score=fundus.quality_score if fundus and fundus.quality_score is not None else 60.0,
        quality_details=fundus.quality_detail if fundus else {},
        lesion_summary=pred.lesion_summary if pred else None,
        gradcam_metadata={
            "target_class": pred.predicted_grade if pred else None,
            "class_activation_score": pred.confidence if pred else 0.5,
        },
    )
    return {
        "screening_id": str(screening_id),
        **result,
    }

