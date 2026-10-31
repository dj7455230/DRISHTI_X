"""
DRISHTI-X — Dashboard Routes
GET /api/dashboard/statistics
GET /api/dashboard/referral-queue
GET /api/models
GET /api/metrics
GET /api/audit
"""
from typing import Annotated, List, Optional, Dict, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.base import get_db
from app.models.user import User
from app.models.patient import Patient
from app.models.screening import (
    Screening, ScreeningStatus, ReferralPriority,
    Prediction, FundusImage, DoctorReview, AssuranceDecision
)
from app.models.audit import AuditLog, ModelVersion
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["Dashboard"])

# Dataset paths — resolved relative to project root (one level above backend/)
import pathlib
_PROJECT_ROOT = pathlib.Path(__file__).parent.parent.parent.parent.parent


@router.get("/dashboard/statistics")
def get_statistics(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Overview statistics for the dashboard."""
    total_patients = db.query(func.count(Patient.id)).scalar()
    total_screenings = db.query(func.count(Screening.id)).scalar()
    pending = db.query(func.count(Screening.id)).filter(
        Screening.status == ScreeningStatus.PENDING
    ).scalar()
    critical = db.query(func.count(Screening.id)).filter(
        Screening.referral_priority == ReferralPriority.CRITICAL
    ).scalar()
    human_review = db.query(func.count(Screening.id)).filter(
        Screening.status == ScreeningStatus.HUMAN_REVIEW_REQUIRED
    ).scalar()
    recapture = db.query(func.count(Screening.id)).filter(
        Screening.status == ScreeningStatus.RECAPTURE_REQUIRED
    ).scalar()
    referable = db.query(func.count(Screening.id)).filter(
        Screening.is_referable == True
    ).scalar()

    return {
        "total_patients": total_patients,
        "total_screenings": total_screenings,
        "pending_screenings": pending,
        "critical_cases": critical,
        "human_review_required": human_review,
        "recapture_required": recapture,
        "referable_cases": referable,
        "model_status": "TRAINED",
        "disclaimer": "AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS",
    }


@router.get("/dashboard/referral-queue")
def get_referral_queue(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    sort_by: str = Query("priority_score", enum=["priority_score", "referral_score", "created_at"]),
    priority: Optional[str] = Query(None, description="CRITICAL, HIGH, MEDIUM, ROUTINE"),
    queue_type: str = Query("review", enum=["review", "recapture", "all"]),
    ai_grade: Optional[int] = Query(None, ge=0, le=4),
    assurance_status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Feature 21 & 22: Dedicated Priority Referral Queue for Ophthalmologist.
    Filters by triage priority, review vs recapture queues, AI grades, and sorts by priority score.
    """
    query = db.query(Screening)

    # Queue type filtering
    if queue_type == "recapture":
        query = query.filter(Screening.status == ScreeningStatus.RECAPTURE_REQUIRED)
    elif queue_type == "review":
        query = query.filter(Screening.status.in_([
            ScreeningStatus.HUMAN_REVIEW_REQUIRED,
            ScreeningStatus.ANALYZED,
            ScreeningStatus.PENDING,
            ScreeningStatus.IN_REVIEW,
            ScreeningStatus.REFERRED,
        ]))

    # Priority filtering
    if priority:
        query = query.filter(Screening.priority_level == priority.upper())

    # Assurance decision filtering
    if assurance_status:
        try:
            enum_val = AssuranceDecision(assurance_status)
            query = query.filter(Screening.assurance_decision == enum_val)
        except Exception:
            pass

    # AI grade filtering
    if ai_grade is not None:
        query = query.join(Prediction, Prediction.screening_id == Screening.id).filter(
            Prediction.predicted_grade == ai_grade
        )

    # Sorting
    if sort_by == "priority_score":
        query = query.order_by(Screening.priority_score.desc().nullslast(), Screening.created_at.desc())
    elif sort_by == "referral_score":
        query = query.order_by(Screening.referral_score.desc().nullslast(), Screening.created_at.desc())
    else:
        query = query.order_by(Screening.created_at.desc())

    screenings = query.limit(limit).all()

    results = []
    for s in screenings:
        patient = db.query(Patient).filter(Patient.id == s.patient_id).first()
        prediction = db.query(Prediction).filter(Prediction.screening_id == s.id).first()
        fundus = db.query(FundusImage).filter(FundusImage.screening_id == s.id).first()

        p_name = "Anonymous Patient"
        p_code = None
        if patient:
            p_name = patient.name if not patient.is_anonymous else f"Patient #{patient.patient_code or str(patient.id)[:6]}"
            p_code = patient.patient_code

        results.append({
            "id": str(s.id),
            "case_number": s.case_number or f"DX-CASE-{s.created_at.strftime('%Y%m')}-{str(s.id)[:6].upper()}",
            "patient_id": str(s.patient_id),
            "patient_name": p_name,
            "patient_code": p_code,
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
            "eye_side": s.eye_side,
            "priority_level": s.priority_level or "ROUTINE",
            "priority_score": round(s.priority_score, 1) if s.priority_score is not None else 0.0,
            "priority_factors": s.priority_factors or [],
            "priority_rule_version": s.priority_rule_version or "1.0.0",
            "predicted_grade": prediction.predicted_grade if prediction else None,
            "grade_label": prediction.grade_label if prediction else None,
            "confidence": round(prediction.confidence, 4) if prediction and prediction.confidence else None,
            "quality_score": round(fundus.quality_score, 1) if fundus and fundus.quality_score is not None else None,
            "is_gradable": fundus.is_gradable if fundus else False,
            "assurance_decision": s.assurance_decision.value if s.assurance_decision else "HUMAN_REVIEW_REQUIRED",
            "assurance_reasons": s.assurance_reasons or [],
            "concordance_level": prediction.concordance_level if prediction else None,
            "mismatch_detected": bool(prediction.mismatch_detected) if prediction else False,
            "mismatch_details": prediction.mismatch_details if prediction else [],
            "referral_priority": s.referral_priority.value if s.referral_priority else None,
            "referral_score": s.referral_score,
            "queue_type": "recapture" if s.status == ScreeningStatus.RECAPTURE_REQUIRED else "review",
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "analyzed_at": s.analyzed_at.isoformat() if s.analyzed_at else None,
        })

    return results


@router.get("/ophthalmologist/dashboard")
def get_ophthalmologist_dashboard(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    sort_by: str = Query("priority_score", enum=["priority_score", "referral_score", "created_at"]),
    priority: Optional[str] = Query(None, description="CRITICAL, HIGH, MEDIUM, ROUTINE"),
    queue_type: str = Query("review", enum=["review", "recapture", "all"]),
    ai_grade: Optional[int] = Query(None, ge=0, le=4),
    assurance_status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Feature 20 & 21: Dedicated Ophthalmologist Dashboard with Priority Referral Queue.
    Provides complete triage metrics, pending review cases with AI evidence and mismatch alerts.
    """
    total_screenings = db.query(func.count(Screening.id)).scalar()
    human_review = db.query(func.count(Screening.id)).filter(
        Screening.status == ScreeningStatus.HUMAN_REVIEW_REQUIRED
    ).scalar()
    pending = db.query(func.count(Screening.id)).filter(
        Screening.status.in_([ScreeningStatus.PENDING, ScreeningStatus.ANALYZED])
    ).scalar()
    critical = db.query(func.count(Screening.id)).filter(
        (Screening.priority_level == "CRITICAL") | (Screening.referral_priority == ReferralPriority.CRITICAL)
    ).scalar()
    high_priority = db.query(func.count(Screening.id)).filter(
        Screening.priority_level == "HIGH"
    ).scalar()
    validated = db.query(func.count(Screening.id)).filter(
        Screening.assurance_decision == AssuranceDecision.VALIDATED
    ).scalar()
    recapture = db.query(func.count(Screening.id)).filter(
        Screening.status == ScreeningStatus.RECAPTURE_REQUIRED
    ).scalar()
    reviewed = db.query(func.count(Screening.id)).filter(
        Screening.status == ScreeningStatus.REVIEWED
    ).scalar()
    in_review = db.query(func.count(Screening.id)).filter(
        Screening.status == ScreeningStatus.IN_REVIEW
    ).scalar()
    referred = db.query(func.count(Screening.id)).filter(
        Screening.status == ScreeningStatus.REFERRED
    ).scalar()

    # Query cases using filtering
    review_query = db.query(Screening)
    if queue_type == "recapture":
        review_query = review_query.filter(Screening.status == ScreeningStatus.RECAPTURE_REQUIRED)
    elif queue_type == "review":
        review_query = review_query.filter(
            Screening.status.in_([
                ScreeningStatus.HUMAN_REVIEW_REQUIRED,
                ScreeningStatus.ANALYZED,
                ScreeningStatus.PENDING,
                ScreeningStatus.IN_REVIEW,
                ScreeningStatus.REFERRED,
            ])
        )

    if priority:
        review_query = review_query.filter(Screening.priority_level == priority.upper())

    if assurance_status:
        try:
            review_query = review_query.filter(Screening.assurance_decision == AssuranceDecision(assurance_status))
        except Exception:
            pass

    if ai_grade is not None:
        review_query = review_query.join(Prediction, Prediction.screening_id == Screening.id).filter(
            Prediction.predicted_grade == ai_grade
        )

    if sort_by == "priority_score":
        review_query = review_query.order_by(
            Screening.priority_score.desc().nullslast(),
            Screening.created_at.desc(),
        )
    elif sort_by == "referral_score":
        review_query = review_query.order_by(
            Screening.referral_score.desc().nullslast(),
            Screening.created_at.desc(),
        )
    else:
        review_query = review_query.order_by(Screening.created_at.desc())

    review_cases = review_query.limit(limit).all()

    cases = []
    for s in review_cases:
        patient = db.query(Patient).filter(Patient.id == s.patient_id).first()
        prediction = db.query(Prediction).filter(Prediction.screening_id == s.id).first()
        fundus = db.query(FundusImage).filter(FundusImage.screening_id == s.id).first()

        p_name = "Anonymous Patient"
        p_code = None
        p_age = None
        p_gender = None
        if patient:
            p_name = patient.name if not patient.is_anonymous else f"Patient #{patient.patient_code or str(patient.id)[:6]}"
            p_code = patient.patient_code
            p_age = patient.age
            p_gender = patient.gender

        cases.append({
            "id": str(s.id),
            "case_number": s.case_number or f"DX-CASE-{s.created_at.strftime('%Y%m')}-{str(s.id)[:6].upper()}",
            "patient_id": str(s.patient_id),
            "patient_name": p_name,
            "patient_code": p_code,
            "patient_age": p_age,
            "patient_gender": p_gender,
            "status": s.status.value,
            "eye_side": s.eye_side,
            "priority_level": s.priority_level or "ROUTINE",
            "priority_score": round(s.priority_score, 1) if s.priority_score is not None else 0.0,
            "priority_factors": s.priority_factors or [],
            "priority_rule_version": s.priority_rule_version or "1.0.0",
            "predicted_grade": prediction.predicted_grade if prediction else None,
            "grade_label": prediction.grade_label if prediction else None,
            "confidence": round(prediction.confidence, 4) if prediction and prediction.confidence else None,
            "quality_score": round(fundus.quality_score, 1) if fundus and fundus.quality_score is not None else None,
            "is_gradable": fundus.is_gradable if fundus else False,
            "assurance_decision": s.assurance_decision.value if s.assurance_decision else "HUMAN_REVIEW_REQUIRED",
            "assurance_reasons": s.assurance_reasons or [],
            "concordance_level": prediction.concordance_level if prediction else None,
            "mismatch_detected": bool(prediction.mismatch_detected) if prediction else False,
            "mismatch_details": prediction.mismatch_details if prediction else [],
            "referral_priority": s.referral_priority.value if s.referral_priority else "LOW",
            "referral_score": round(s.referral_score, 1) if s.referral_score else 0.0,
            "queue_type": "recapture" if s.status == ScreeningStatus.RECAPTURE_REQUIRED else "review",
            "has_lesions": bool(prediction and prediction.lesion_summary),
            "has_gradcam": bool(prediction and prediction.gradcam_path),
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "analyzed_at": s.analyzed_at.isoformat() if s.analyzed_at else None,
        })

    return {
        "metrics": {
            "total_screenings": total_screenings,
            "human_review_required": human_review,
            "pending_screenings": pending,
            "critical_cases": critical,
            "high_priority_cases": high_priority,
            "validated_cases": validated,
            "recapture_required": recapture,
            "reviewed_cases": reviewed,
            "in_review_cases": in_review,
            "referred_cases": referred,
        },
        "cases": cases,
        "governance_notice": (
            "DRISHTI-X Clinical Assurance: Autonomous diagnosis is disabled. "
            "All recommendations require clinical sign-off by a certified ophthalmologist."
        ),
    }


@router.get("/models")
def list_models(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """List all model versions. Shows real status."""
    return get_model_status_detail(db)


@router.get("/models/status")
def get_models_status_endpoint(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Detailed live status of all clinical AI models (classification & segmentation)."""
    return get_model_status_detail(db)


def get_model_status_detail(db: Session):
    models = db.query(ModelVersion).all()
    if not models:
        try:
            from ai.classification.model import _loader
            import torch
            import os
            root = _PROJECT_ROOT
            eff_path = root / "models/weights/best_model.pth"
            unet_path = root / "models/weights/unet_lesion.pth"
            cal_path = root / "models/weights/temperature.json"

            eff_avail = eff_path.exists()
            unet_avail = unet_path.exists()
            cal_avail = cal_path.exists()

            cal_temp = 1.0
            if cal_avail:
                try:
                    import json
                    with open(cal_path) as f:
                        cal_temp = json.load(f).get("temperature", 1.0)
                except Exception:
                    pass

            return [{
                "model_name": "EfficientNet-B0",
                "version": _loader.model_version if _loader else "1.0.0",
                "architecture": "EfficientNet-B0 + Transfer Learning (timm)",
                "status": "TRAINED" if eff_avail else "NOT_TRAINED",
                "weights_available": eff_avail,
                "weights_path": str(eff_path) if eff_avail else None,
                "training_dataset": "APTOS 2019 (Verified Split)",
                "calibrated": cal_avail,
                "temperature": round(cal_temp, 4),
                "is_demo": not eff_avail,
                "metrics_note": "Evaluated on held-out test split. Check reports/evaluation_results.json.",
            }, {
                "model_name": "U-Net Lesion Segmentation",
                "version": "1.0.0",
                "architecture": "4-Stage Encoder/Decoder U-Net (4 Output Channels)",
                "status": "TRAINED" if unet_avail else "NOT_TRAINED",
                "weights_available": unet_avail,
                "weights_path": str(unet_path) if unet_avail else None,
                "training_dataset": "IDRiD Lesion Groundtruths (MA, Hemorrhage, Hard Exudate)",
                "target_classes": ["Background", "Microaneurysm", "Hemorrhage", "Hard Exudate"],
                "is_demo": not unet_avail,
                "metrics_note": "Evaluated on IDRiD independent testing set.",
            }]
        except Exception:
            pass
        return [{
            "model_name": "EfficientNet-B0",
            "version": "0.0.0",
            "architecture": "EfficientNet-B0 + Transfer Learning",
            "status": "NOT_TRAINED",
            "training_dataset": "NOT_AVAILABLE",
            "accuracy": None,
            "sensitivity": None,
            "specificity": None,
            "f1_score": None,
            "roc_auc": None,
            "metrics_note": "Not yet trained. Run training/train_efficientnet.py",
        }]
    return models
    """List all model versions. Shows real status."""
    models = db.query(ModelVersion).all()
    if not models:
        # Read from pre-loaded model loader singleton (already loaded at startup)
        try:
            from ai.classification.model import _loader
            if _loader is not None and _loader.status in ("TRAINED", "VALIDATED"):
                import torch
                ckpt = torch.load(_loader.weights_path, map_location="cpu",
                                  weights_only=False) if _loader.weights_path else {}
                return [{
                    "model_name":       "EfficientNet-B0",
                    "version":          _loader.model_version,
                    "architecture":     "EfficientNet-B0 + Transfer Learning (timm)",
                    "status":           _loader.status,
                    "training_dataset": _loader.training_dataset,
                    "trained_epoch":    ckpt.get("epoch"),
                    "accuracy":         ckpt.get("val_accuracy"),
                    "sensitivity":      ckpt.get("val_sensitivity"),
                    "specificity":      ckpt.get("val_specificity"),
                    "f1_score":         ckpt.get("val_f1"),
                    "roc_auc":          None,
                    "metrics_note": (
                        f"Epoch {ckpt.get('epoch')} checkpoint on "
                        f"{_loader.training_dataset}. "
                        "Run training/evaluate.py for full held-out test set metrics."
                    ),
                }]
        except Exception:
            pass
        return [{
            "model_name":    "EfficientNet-B0",
            "version":       "0.0.0",
            "architecture":  "EfficientNet-B0 + Transfer Learning",
            "status":        "NOT_TRAINED",
            "training_dataset": "NOT_AVAILABLE",
            "accuracy":      None,
            "sensitivity":   None,
            "specificity":   None,
            "f1_score":      None,
            "roc_auc":       None,
            "metrics_note":  "Not yet trained. Run training/train_efficientnet.py",
        }]
    return models


@router.get("/audit")
def get_audit_logs(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_admin)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """Audit trail — admin only."""
    logs = db.query(AuditLog).order_by(
        AuditLog.timestamp.desc()
    ).offset(skip).limit(limit).all()

    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "screening_id": str(log.screening_id) if log.screening_id else None,
            "action": log.action,
            "user_role": log.user_role,
            "detail": log.detail,
            "model_version": log.model_version,
            "prev_event_hash": log.prev_event_hash,
            "event_hash": log.event_hash,
            "timestamp": log.timestamp.isoformat(),
        }
        for log in logs
    ]


@router.get("/audit/verify-chain")
def verify_audit_chain_integrity(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_admin)],
):
    """
    Feature 44: Tamper-evident hash chain verification endpoint.
    """
    from app.services.audit_service import AuditService
    return AuditService.verify_chain(db)


# ----------------------------------------------------------------
# DATASETS STATUS
# ----------------------------------------------------------------
@router.get("/datasets")
def get_datasets_status(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Returns status and statistics for all connected datasets.
    Paths resolved relative to the project root.
    """
    import os, glob
    import pandas as pd

    root = _PROJECT_ROOT

    def _count_files(path, pattern="*"):
        d = root / path
        if not d.exists():
            return 0, False
        return len(glob.glob(str(d / pattern))), True

    # ── APTOS 2019 ──────────────────────────────────────────
    aptos_train_csv = root / "datasets/aptos2019/train.csv"
    aptos_test_csv  = root / "datasets/aptos2019/test.csv"
    aptos_train_imgs, aptos_ok = _count_files("datasets/aptos2019/train_images", "*.png")
    aptos_test_imgs, _         = _count_files("datasets/aptos2019/test_images",  "*.png")
    aptos_grade_dist = {}
    if aptos_train_csv.exists():
        df = pd.read_csv(aptos_train_csv)
        aptos_grade_dist = df["diagnosis"].value_counts().sort_index().to_dict()
        aptos_grade_dist = {int(k): int(v) for k, v in aptos_grade_dist.items()}

    # ── IDRiD Disease Grading ───────────────────────────────
    idrid_grading_dir = root / "datasets/idrid/B. Disease Grading"
    idrid_train_csv   = idrid_grading_dir / "2. a. IDRiD_Disease Grading_Training Labels.csv"
    idrid_test_csv    = idrid_grading_dir / "2. b. IDRiD_Disease Grading_Testing Labels.csv"
    idrid_train_imgs, _ = _count_files("datasets/idrid/B. Disease Grading/1. Original Images/a. Training Set", "*.jpg")
    idrid_test_imgs, _  = _count_files("datasets/idrid/B. Disease Grading/1. Original Images/b. Testing Set",  "*.jpg")
    idrid_grade_dist = {}
    if idrid_train_csv.exists():
        try:
            df = pd.read_csv(idrid_train_csv)
            col = [c for c in df.columns if "Retinopathy" in c or "grade" in c.lower()][0]
            idrid_grade_dist = df[col].value_counts().sort_index().to_dict()
            idrid_grade_dist = {int(k): int(v) for k, v in idrid_grade_dist.items()}
        except Exception:
            pass

    # ── IDRiD Segmentation ──────────────────────────────────
    idrid_seg_train, _ = _count_files(
        "datasets/idrid/A. Segmentation/1. Original Images/a. Training Set", "*.jpg"
    )
    idrid_seg_test, _  = _count_files(
        "datasets/idrid/A. Segmentation/1. Original Images/b. Testing Set",  "*.jpg"
    )
    idrid_seg_masks_ma, _ = _count_files(
        "datasets/idrid/A. Segmentation/2. All Segmentation Groundtruths/a. Training Set/1. Microaneurysms",
        "*.tif"
    )

    # ── Messidor-2 ──────────────────────────────────────────
    messidor_csv = root / "datasets/messidor2/archive/messidor_data.csv"
    messidor_imgs, _ = _count_files(
        "datasets/messidor2/archive/messidor-2/messidor-2/preprocess", "*"
    )
    messidor_grade_dist = {}
    messidor_gradable   = 0
    if messidor_csv.exists():
        df = pd.read_csv(messidor_csv)
        messidor_gradable   = int(df["adjudicated_gradable"].sum())
        messidor_grade_dist = df["diagnosis"].value_counts().sort_index().to_dict()
        messidor_grade_dist = {int(k): int(v) for k, v in messidor_grade_dist.items()}

    # ── DRIVE ───────────────────────────────────────────────
    drive_train_imgs,    _ = _count_files("datasets/drive/DRIVE/training/images",    "*.tif")
    drive_train_masks,   _ = _count_files("datasets/drive/DRIVE/training/1st_manual","*.gif")
    drive_test_imgs,     _ = _count_files("datasets/drive/DRIVE/test/images",        "*.tif")

    # ── Combined training split CSVs ────────────────────────
    combined_csv  = root / "datasets/combined_train.csv"
    train_csv     = root / "datasets/train_split.csv"
    val_csv       = root / "datasets/val_split.csv"
    test_csv      = root / "datasets/test_split.csv"
    combined_n    = len(pd.read_csv(combined_csv)) if combined_csv.exists() else 0
    train_n       = len(pd.read_csv(train_csv))    if train_csv.exists()    else 0
    val_n         = len(pd.read_csv(val_csv))      if val_csv.exists()      else 0
    test_n        = len(pd.read_csv(test_csv))     if test_csv.exists()     else 0

    return {
        "disclaimer": "AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS",
        "datasets": {
            "aptos2019": {
                "name":           "APTOS 2019 Blindness Detection",
                "available":      aptos_ok,
                "train_images":   aptos_train_imgs,
                "test_images":    aptos_test_imgs,
                "grade_distribution": aptos_grade_dist,
                "use":            "DR Classification Training",
                "path":           "datasets/aptos2019/",
            },
            "idrid_grading": {
                "name":           "IDRiD Disease Grading",
                "available":      idrid_train_imgs > 0,
                "train_images":   idrid_train_imgs,
                "test_images":    idrid_test_imgs,
                "grade_distribution": idrid_grade_dist,
                "use":            "DR Classification Training",
                "path":           "datasets/idrid/B. Disease Grading/",
            },
            "idrid_segmentation": {
                "name":           "IDRiD Lesion Segmentation",
                "available":      idrid_seg_train > 0,
                "train_images":   idrid_seg_train,
                "test_images":    idrid_seg_test,
                "mask_types":     ["Microaneurysms", "Haemorrhages", "Hard Exudates",
                                   "Soft Exudates", "Optic Disc"],
                "train_masks_ma": idrid_seg_masks_ma,
                "use":            "U-Net Lesion Segmentation Training",
                "unet_status":    "TRAINED",
                "path":           "datasets/idrid/A. Segmentation/",
            },
            "messidor2": {
                "name":           "Messidor-2",
                "available":      messidor_imgs > 0,
                "total_images":   messidor_imgs,
                "gradable_images":messidor_gradable,
                "grade_distribution": messidor_grade_dist,
                "use":            "External Evaluation Only",
                "note":           "NOT used for training. External test set only.",
                "path":           "datasets/messidor2/",
            },
            "drive": {
                "name":           "DRIVE (Digital Retinal Images for Vessel Extraction)",
                "available":      drive_train_imgs > 0,
                "train_images":   drive_train_imgs,
                "train_masks":    drive_train_masks,
                "test_images":    drive_test_imgs,
                "use":            "Retinal Vessel Segmentation",
                "note":           "Separate vessel segmentation pipeline. NOT used for DR classification.",
                "path":           "datasets/drive/DRIVE/",
            },
        },
        "training_splits": {
            "combined_train_csv":  str(combined_csv.name) if combined_csv.exists() else None,
            "combined_n":          combined_n,
            "train_n":             train_n,
            "val_n":               val_n,
            "test_n":              test_n,
            "note":                "train+val from APTOS2019+IDRiD. test_split = held-out 462 images.",
        },
        "model_checkpoints": {
            "efficientnet_b0":  os.path.exists(str(root / "models/weights/best_model.pth")),
            "unet_lesion":      os.path.exists(str(root / "models/weights/unet_lesion.pth")),
            "temperature_json": os.path.exists(str(root / "models/weights/temperature.json")),
        },
    }


# ----------------------------------------------------------------
# DATASET GENERALIZATION BENCHMARK
# ----------------------------------------------------------------
@router.get("/evaluation/generalization")
def get_generalization_benchmark(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Returns multi-cohort generalization benchmark results evaluated across:
    1. IDRiD Testing Set (Indian Patient Population, 103 images)
    2. APTOS 2019 Held-out Test Split (Asia-Pacific rural screening, 462 images)
    3. Messidor-2 External Benchmark (European hospital cohort, 874 images)
    """
    from ai.evaluation.generalization_service import get_dataset_generalization_summary
    return get_dataset_generalization_summary()
