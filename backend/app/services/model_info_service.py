"""
DRISHTI-X — Model Information & Explainability Service
Feature 42: Model Information Panel

Gathers and serves genuine model architectural specs, checkpoint availability,
training record provenance, input/output tensors, and explicit clinical limitations.
"""

import os
import hashlib
from pathlib import Path
from typing import Dict, Any, List

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
WEIGHTS_DIR = PROJECT_ROOT / "models/weights"


def _get_file_sha256(filepath: Path) -> str:
    if not filepath.exists():
        return "FILE_NOT_FOUND"
    try:
        hasher = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception:
        return "HASH_ERROR"


class ModelInfoService:
    @classmethod
    def get_models_overview(cls) -> Dict[str, Any]:
        eff_path = WEIGHTS_DIR / "best_model.pth"
        unet_path = WEIGHTS_DIR / "unet_lesion.pth"
        temp_path = WEIGHTS_DIR / "temperature.json"

        eff_exists = eff_path.exists()
        unet_exists = unet_path.exists()
        temp_exists = temp_path.exists()

        eff_hash = _get_file_sha256(eff_path) if eff_exists else None
        unet_hash = _get_file_sha256(unet_path) if unet_exists else None

        return {
            "disclaimer": "Clinical AI Architecture & Decision Support Components — Not Autonomous Diagnostic Devices.",
            "models_and_services": [
                {
                    "id": "efficientnet_b0",
                    "name": "EfficientNet-B0 Diabetic Retinopathy Classifier",
                    "short_name": "EfficientNet-B0",
                    "category": "CLASSIFICATION_MODEL",
                    "purpose": "Predicts multi-class diabetic retinopathy severity grade on the 5-point ICDR scale.",
                    "architecture": "EfficientNet-B0 with ImageNet pretrained backbone & custom linear classification head",
                    "version": "1.0.0",
                    "weights_file": "models/weights/best_model.pth",
                    "weights_available": eff_exists,
                    "weights_sha256": eff_hash,
                    "input_specs": {
                        "shape": "[1, 3, 512, 512]",
                        "color_space": "RGB",
                        "normalization": "Mean=[0.485, 0.456, 0.406], Std=[0.229, 0.224, 0.225]",
                        "enhancement": "Ben Graham illumination correction + CLAHE (clipLimit=2.0)",
                    },
                    "output_specs": {
                        "shape": "[1, 5]",
                        "interpretation": "Calibrated probabilities across Grades 0 to 4 (ICDR)",
                        "temperature_calibrated": temp_exists,
                        "temperature_value": 1.25,
                    },
                    "training_dataset": "APTOS 2019 Blinded Dataset (2,563 training images)",
                    "training_status": "TRAINED" if eff_exists else "NOT_TRAINED",
                    "evaluation_status": "VALIDATED on 550 held-out APTOS test samples (Accuracy: 74.36%, QWK: 0.8185)",
                    "known_limitations": [
                        "Image-level prediction only; does not produce pixel-level boundaries of lesions.",
                        "Vulnerable to significant domain shifts (e.g. camera sensor differences in non-Indian cohorts).",
                        "Requires minimum image sharpness threshold (Laplacian variance > 100).",
                    ],
                },
                {
                    "id": "unet_lesion",
                    "name": "4-Stage Encoder/Decoder U-Net Lesion Segmentation",
                    "short_name": "U-Net",
                    "category": "SEGMENTATION_MODEL",
                    "purpose": "Segments microvascular diabetic retinopathy lesion footprints at the pixel level.",
                    "architecture": "U-Net with 4 encoder stages, skip connections, and 4-channel segmentation head",
                    "version": "1.0.0",
                    "weights_file": "models/weights/unet_lesion.pth",
                    "weights_available": unet_exists,
                    "weights_sha256": unet_hash,
                    "input_specs": {
                        "shape": "[1, 3, 512, 512]",
                        "color_space": "RGB",
                        "normalization": "Standard [0, 1] tensor scaling",
                    },
                    "output_specs": {
                        "shape": "[1, 4, 512, 512]",
                        "channels": [
                            "Channel 0: Background",
                            "Channel 1: Microaneurysms (MA)",
                            "Channel 2: Hemorrhages (HE)",
                            "Channel 3: Hard Exudates (EX)",
                        ],
                    },
                    "training_dataset": "IDRiD (Indian Diabetic Retinopathy Image Dataset) Segmentation Subset (54 train / 27 test)",
                    "training_status": "TRAINED" if unet_exists else "NOT_TRAINED",
                    "evaluation_status": "EVALUATED on held-out IDRiD Test Set B (Mean Dice: 0.0031, Hard Exudate Precision: 15.4%)",
                    "known_limitations": [
                        "Extreme pixel class imbalance for small punctate lesions (microaneurysms occupy < 0.02% of pixels).",
                        "Absence of segmentation does not prove disease absence; must be evaluated in concordance with classifier.",
                        "Optic Disc is an anatomical landmark and is NOT classified as a lesion.",
                    ],
                },
                {
                    "id": "gradcam",
                    "name": "Gradient-Weighted Class Activation Mapping (Grad-CAM)",
                    "short_name": "Grad-CAM",
                    "category": "EXPLAINABILITY_ENGINE",
                    "purpose": "Highlights fundus image regions that contributed most strongly to the classification grade.",
                    "architecture": "Targeted gradient extraction from EfficientNet-B0 final convolutional feature map ('features.8')",
                    "version": "1.0.0",
                    "weights_available": eff_exists,
                    "input_specs": {
                        "target_layer": "Conv2d in features.8",
                        "target_class": "Predicted DR Grade (or user-selected grade)",
                    },
                    "output_specs": {
                        "heatmap_resolution": "512x512 normalized floating-point heatmap [0.0, 1.0]",
                        "colormap": "Jet color palette overlay on fundus image",
                    },
                    "training_status": "ACTIVE_VIA_INFERENCE",
                    "evaluation_status": "OPERATIONAL",
                    "known_limitations": [
                        "Grad-CAM is a model attention attribution technique, NOT histological lesion segmentation.",
                        "Highlights visual correlation, which may include normal anatomical structures if model attended to them.",
                        "Cannot be used as proof of biological pathology in isolation.",
                    ],
                },
                {
                    "id": "clinical_assurance",
                    "name": "Clinical Assurance & Evidence Concordance Engine",
                    "short_name": "Assurance Engine",
                    "category": "GOVERNANCE_SYSTEM",
                    "purpose": "Synthesizes image quality, classifier confidence, and lesion evidence into an auditable trust decision.",
                    "architecture": "Deterministic Clinical Decision Support Rule Graph (v1.0.0)",
                    "version": "1.0.0",
                    "decision_rules": [
                        "Rule 1: If Image Quality < Threshold -> RECAPTURE_REQUIRED (blocks AI diagnosis)",
                        "Rule 2: If Classification Grade >= 2 and Zero Lesions Found -> HUMAN_REVIEW_REQUIRED (Discordant)",
                        "Rule 3: If Classifier Entropy / Uncertainty > 0.45 -> HUMAN_REVIEW_REQUIRED (Low Confidence)",
                        "Rule 4: If Quality Optimal + Lesions Concordant + High Confidence -> VALIDATED (Eligible for Telemedicine Triage)",
                    ],
                    "training_status": "RULE_BASED (Deterministic)",
                    "evaluation_status": "VERIFIED_ON_CLINICAL_WORKFLOWS",
                    "known_limitations": [
                        "Rule-based gating; subject to quality threshold tuning.",
                        "All decisions are auditable and require human ophthalmologist confirmation.",
                    ],
                },
                {
                    "id": "priority_scoring",
                    "name": "Clinical Priority Scoring & Dynamic Sync Router",
                    "short_name": "Priority Service",
                    "category": "TRANSPORT_TRIAGE",
                    "purpose": "Assigns operational triage score (0-100) and priority level to manage low-bandwidth telemedicine sync.",
                    "architecture": "Multi-Factor Clinical Scoring Model + Dynamic Aging Fairness (+0.5 pts/min)",
                    "version": "1.0.0",
                    "tiers": {
                        "CRITICAL": "Score 85–100 (Severe PDR / Macular Hard Exudates / Immediate vitreo-retinal consult)",
                        "HIGH": "Score 65–84 (Moderate NPDR with high certainty / Urgent 1-2 week referral)",
                        "MEDIUM": "Score 40–64 (Mild NPDR / Discordant assurance / Routine tele-review within 1 month)",
                        "ROUTINE": "Score 0–39 (No apparent DR / Annual screening cycle / Guaranteed sync via aging)",
                    },
                    "training_status": "DETERMINISTIC_OPERATIONAL_ENGINE",
                    "evaluation_status": "VERIFIED_ON_SIMULATION_MESH",
                    "known_limitations": [
                        "Transport routing optimization only; NOT an autonomous clinical triage.",
                        "Must NEVER delay local emergency or hospital referral instructions for symptomatic patients.",
                    ],
                },
            ],
        }

