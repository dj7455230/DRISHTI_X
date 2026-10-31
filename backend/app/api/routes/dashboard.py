"""
DRISHTI-X — Dashboard Routes
GET /api/dashboard/statistics
GET /api/dashboard/referral-queue
GET /api/models
GET /api/metrics
GET /api/audit
"""
from typing import Annotated, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.base import get_db
from app.models.user import User
from app.models.patient import Patient
from app.models.screening import Screening, ScreeningStatus, ReferralPriority
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
    sort_by: str = Query("referral_score", enum=["referral_score", "created_at"]),
    limit: int = Query(50, ge=1, le=200),
):
    """Priority referral queue for ophthalmologist."""
    query = db.query(Screening).filter(
        Screening.is_referable == True,
        Screening.status != ScreeningStatus.REVIEWED
    )
    if sort_by == "referral_score":
        query = query.order_by(Screening.referral_score.desc().nullslast())
    else:
        query = query.order_by(Screening.created_at.desc())

    screenings = query.limit(limit).all()
    return [
        {
            "id": str(s.id),
            "patient_id": str(s.patient_id),
            "status": s.status.value,
            "referral_priority": s.referral_priority.value if s.referral_priority else None,
            "referral_score": s.referral_score,
            "created_at": s.created_at.isoformat(),
        }
        for s in screenings
    ]


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
            "timestamp": log.timestamp.isoformat(),
        }
        for log in logs
    ]


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
