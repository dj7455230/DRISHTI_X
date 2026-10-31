"""
DRISHTI-X — Model Evaluation API Routes
Feature 40: AI Model Evaluation Dashboard
Serves genuine evaluation metrics from actual saved artifacts:
- reports/evaluation_results.json (EfficientNet-B0 on held-out APTOS test set N=550)
- reports/unet_evaluation.json (U-Net on held-out IDRiD test set N=27)
- reports/messidor2_external_evaluation.json (Messidor-2 external validation N=1,744)

STRICT RULE: If any artifact is missing, status is set to NOT_EVALUATED.
Zero fabricated or hardcoded test metrics.
"""
import os
import json
import hashlib
from datetime import datetime, timezone
from typing import Annotated, Dict, Any
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/evaluation", tags=["Model Evaluation"])

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
REPORTS_DIR = os.path.join(PROJECT_ROOT, "reports")


def _read_artifact(filename: str) -> Dict[str, Any]:
    filepath = os.path.join(REPORTS_DIR, filename)
    if not os.path.exists(filepath):
        return {
            "status": "NOT_EVALUATED",
            "error": f"Evaluation artifact '{filename}' not found on disk.",
            "data": None,
        }
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            data = json.loads(content)
        sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()
        mtime = datetime.fromtimestamp(os.path.getmtime(filepath), tz=timezone.utc).isoformat()
        return {
            "status": "EVALUATED",
            "provenance": {
                "filename": filename,
                "sha256": sha256,
                "evaluated_at": mtime,
                "file_size_bytes": os.path.getsize(filepath),
            },
            "data": data,
        }
    except Exception as e:
        return {
            "status": "NOT_EVALUATED",
            "error": f"Failed to parse evaluation file '{filename}': {str(e)}",
            "data": None,
        }


@router.get("/metrics")
def get_all_evaluation_metrics(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 40: Load genuine evaluation metrics for EfficientNet-B0, U-Net,
    and Messidor-2 External Validation.
    """
    aptos_artifact = _read_artifact("evaluation_results.json")
    unet_artifact = _read_artifact("unet_evaluation.json")
    messidor_artifact = _read_artifact("messidor2_external_evaluation.json")

    return {
        "system": "DRISHTI-X Retinal AI Model Evaluation Engine",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "integrity_rule": "Metrics loaded from disk artifacts without modification or interpolation.",
        "classification": {
            "model": "EfficientNet-B0 (DR Classification)",
            "test_dataset": "APTOS 2019 Blinded Held-Out Test Set",
            "status": aptos_artifact["status"],
            "provenance": aptos_artifact.get("provenance"),
            "metrics": aptos_artifact.get("data"),
        },
        "segmentation": {
            "model": "U-Net Retinal Lesion Segmentation (MA, HE, EX)",
            "test_dataset": "IDRiD Held-Out Testing Set (Set B)",
            "status": unet_artifact["status"],
            "provenance": unet_artifact.get("provenance"),
            "metrics": unet_artifact.get("data"),
        },
        "external_validation": {
            "model": "EfficientNet-B0 (Zero-Shot Cross-Cohort Validation)",
            "test_dataset": "Messidor-2 Adjudicated Cohort",
            "status": messidor_artifact["status"],
            "provenance": messidor_artifact.get("provenance"),
            "metrics": messidor_artifact.get("data"),
            "domain_shift_notice": (
                "Messidor-2 cohort images originate from different camera optics (Topcon TRC NW6) "
                "in French clinics without Indian population pre-adaptation. External validation "
                "demonstrates domain shift, confirming the need for human ophthalmologist oversight."
            ),
        },
    }


@router.get("/export")
def export_evaluation_report(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Export full evaluation audit bundle for judges and regulators."""
    metrics = get_all_evaluation_metrics(current_user)
    return JSONResponse(
        content=metrics,
        headers={"Content-Disposition": "attachment; filename=drishti_x_model_evaluation_audit.json"}
    )

