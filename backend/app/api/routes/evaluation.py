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


# ----------------------------------------------------------------
# Feature 41: Dataset Transparency & Inventory
# ----------------------------------------------------------------
@router.get("/datasets/inventory")
def get_dataset_inventory_overview(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 41: Verified dataset metadata, manifest counts, class distributions,
    licensing, and explicit task boundaries (APTOS=Classification, IDRiD=Segmentation).
    """
    from app.services.dataset_service import DatasetService
    return DatasetService.get_dataset_inventory()


# ----------------------------------------------------------------
# Feature 42: Model Information & Explainability Specs
# ----------------------------------------------------------------
@router.get("/models/info")
def get_models_information_overview(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 42: Roles, architectures, input/output tensors, checkpoints,
    and verified limitations for all AI models, Grad-CAM, and Clinical Assurance.
    """
    from app.services.model_info_service import ModelInfoService
    return ModelInfoService.get_models_overview()


# ----------------------------------------------------------------
# Feature 43: Cross-Dataset Validation Framework
# ----------------------------------------------------------------
@router.get("/cross-dataset/adapters")
def list_cross_dataset_adapters(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 43: Registered cross-dataset validation adapters and supported classes.
    """
    from ai.evaluation.cross_dataset_adapter import get_registered_adapters
    return get_registered_adapters()


@router.post("/cross-dataset/validate")
def validate_dataset_classes(
    payload: Dict[str, Any],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 43: Validate class mapping compatibility for external cohorts.
    Rejects incompatible grading protocols without silent data distortion.
    """
    from ai.evaluation.cross_dataset_adapter import ADAPTER_REGISTRY

    adapter_id = payload.get("adapter_id", "messidor2")
    adapter = ADAPTER_REGISTRY.get(adapter_id)
    if not adapter:
        return {
            "is_compatible": False,
            "error": f"Unknown or unverified dataset adapter: '{adapter_id}'. Support is not claimed without adapter verification.",
        }

    target_schema = payload.get("target_schema", {
        0: "No DR",
        1: "Mild NPDR",
        2: "Moderate NPDR",
        3: "Severe NPDR",
        4: "Proliferative DR",
    })
    # Cast keys to int if passed as str
    target_schema_int = {int(k): str(v) for k, v in target_schema.items()}
    return adapter.validate_label_mapping(target_schema_int)

