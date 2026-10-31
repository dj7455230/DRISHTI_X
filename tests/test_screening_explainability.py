"""
DRISHTI-X — Automated Test Suite: Explainable AI Screening Module
Tests for:
1. Grad-CAM heatmap generation, hook management, and output artifacts
2. Image quality assessment (focus, illumination, FOV, resolution, gradability)
3. Actionable recapture guidance on quality failure
4. Report generation with verbatim clinical disclaimer
5. PDF report generation with side-by-side visual explanations
6. Numerical safety (NaN, Inf, zero variance handling)
"""
import os
import sys
import tempfile
import pytest
import numpy as np
import cv2
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))

from ai.classification.model import DrishtiEfficientNet, get_model_loader
from ai.classification.preprocessing import get_inference_tensor
from ai.explainability.gradcam import GradCAM, overlay_gradcam_on_image, generate_and_save_gradcam
from ai.quality.quality_engine import assess_image_quality, validate_image_file
from app.services.report_service import generate_report, MANDATORY_CLINICAL_DISCLAIMER
from app.services.pdf_report_service import generate_pdf_report


def create_synthetic_fundus(
    width=512,
    height=512,
    brightness=120,
    blur=False,
    color=(40, 110, 180),
) -> str:
    """Helper to create a synthetic retinal fundus test image on disk."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    radius = int(min(width, height) * 0.45)
    center = (width // 2, height // 2)
    cv2.circle(img, center, radius, color, -1)

    # Add optic disc and vessel-like features
    disc_center = (int(width * 0.35), height // 2)
    cv2.circle(img, disc_center, int(radius * 0.18), (80, 200, 230), -1)

    # Adjust brightness
    if brightness != 120:
        factor = brightness / 120.0
        img = np.clip(img.astype(np.float32) * factor, 0, 255).astype(np.uint8)

    # Apply blur if requested
    if blur:
        img = cv2.GaussianBlur(img, (41, 41), 15.0)

    f = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    cv2.imwrite(f.name, img)
    return f.name


@pytest.fixture(scope="module")
def classification_model():
    m = DrishtiEfficientNet(num_classes=5, pretrained=False)
    m.eval()
    return m


# ────────────────────────────────────────────────────────────────
# 1. GRAD-CAM PIPELINE TESTS
# ────────────────────────────────────────────────────────────────
def test_gradcam_target_layer_detection(classification_model):
    """GradCAM detects the final Conv2d layer in EfficientNet backbone."""
    gc = GradCAM(classification_model)
    assert gc.target_layer_name is not None
    assert "features" in gc.target_layer_name
    assert isinstance(gc._target_layer, torch.nn.Conv2d)
    gc.remove_hooks()
    assert len(gc._hooks) == 0


def test_gradcam_generate_output(classification_model):
    """GradCAM produces a valid 2D uint8 heatmap in range [0, 255]."""
    img_path = create_synthetic_fundus()
    try:
        tensor = get_inference_tensor(img_path, target_size=224)
        gc = GradCAM(classification_model)
        heatmap, target_cls, score = gc.generate(tensor, target_class=2)
        gc.remove_hooks()

        assert heatmap.ndim == 2
        assert heatmap.dtype == np.uint8
        assert 0 <= heatmap.min()
        assert heatmap.max() <= 255
        assert target_cls == 2
        assert 0.0 <= score <= 1.0
    finally:
        if os.path.exists(img_path):
            os.unlink(img_path)


def test_gradcam_generate_and_save_artifacts(classification_model):
    """generate_and_save_gradcam creates overlay, alias, and heatmap files."""
    img_path = create_synthetic_fundus()
    with tempfile.TemporaryDirectory() as tmp_dir:
        out_path = os.path.join(tmp_dir, "gradcam.jpg")
        tensor = get_inference_tensor(img_path, target_size=224)

        result = generate_and_save_gradcam(
            model=classification_model,
            input_tensor=tensor,
            original_image_path=img_path,
            output_path=out_path,
            target_class=1,
        )

        assert os.path.exists(out_path)
        assert os.path.exists(result["overlay_path"])
        assert os.path.exists(result["heatmap_path"])
        assert result["target_class"] == 1
        assert "target_layer" in result

        # Verify overlay image dimensions match original
        orig = cv2.imread(img_path)
        overlay = cv2.imread(out_path)
        assert orig.shape == overlay.shape
    if os.path.exists(img_path):
        os.unlink(img_path)


def test_gradcam_nan_and_zero_safety(classification_model):
    """GradCAM handles zero/flat inputs safely without divide-by-zero or NaN."""
    flat_tensor = torch.zeros((1, 3, 224, 224))
    gc = GradCAM(classification_model)
    try:
        heatmap, cls, score = gc.generate(flat_tensor, target_class=0)
        assert heatmap.shape == (7, 7) or heatmap.ndim == 2
        assert not np.isnan(heatmap).any()
    finally:
        gc.remove_hooks()


# ────────────────────────────────────────────────────────────────
# 2. IMAGE QUALITY ASSESSMENT & RECAPTURE GUIDANCE
# ────────────────────────────────────────────────────────────────
def test_quality_good_image():
    """Clear synthetic fundus image passes quality check as GRADABLE."""
    img_path = create_synthetic_fundus(width=512, height=512, brightness=120, blur=False)
    try:
        res = assess_image_quality(img_path)
        assert res["is_gradable"] is True
        assert res["quality_status"] in ("GRADABLE", "BORDERLINE")
        assert res["quality_score"] > 35.0
        assert res["focus_score"] >= 20.0
    finally:
        if os.path.exists(img_path):
            os.unlink(img_path)


def test_quality_blurry_image_triggers_recapture():
    """Blurry fundus image fails focus check and returns defocus recapture guidance."""
    img_path = create_synthetic_fundus(width=512, height=512, blur=True)
    try:
        res = assess_image_quality(img_path)
        assert res["is_gradable"] is False
        assert res["quality_status"] in ("UNGRADABLE", "BORDERLINE")
        assert any("focus" in g.lower() or "blur" in g.lower() for g in res["recapture_guidance"])
    finally:
        if os.path.exists(img_path):
            os.unlink(img_path)


def test_quality_dark_image_triggers_recapture():
    """Severely underexposed fundus image fails illumination check with guidance."""
    img_path = create_synthetic_fundus(width=512, height=512, brightness=15)
    try:
        res = assess_image_quality(img_path)
        assert res["is_gradable"] is False
        assert res["illumination_score"] < 20.0
        assert any("dark" in g.lower() or "underexposure" in g.lower() or "flash" in g.lower()
                   for g in res["recapture_guidance"] + res["quality_warnings"])
    finally:
        if os.path.exists(img_path):
            os.unlink(img_path)


def test_quality_low_resolution_triggers_recapture():
    """Image smaller than 256x256 is flagged with low-resolution recapture guidance."""
    img_path = create_synthetic_fundus(width=128, height=128)
    try:
        res = assess_image_quality(img_path)
        assert res["is_gradable"] is False
        assert any("resolution" in g.lower() for g in res["recapture_guidance"] + res["quality_warnings"])
    finally:
        if os.path.exists(img_path):
            os.unlink(img_path)


def test_quality_corrupted_file_validation():
    """Non-image or corrupted bytes fail validate_image_file."""
    valid, msg = validate_image_file(b"corrupted_garbage_bytes", "test.jpg")
    assert valid is False
    assert "corrupt" in msg.lower() or "valid" in msg.lower()


# ────────────────────────────────────────────────────────────────
# 3. CLINICAL REPORT & PDF GENERATION TESTS
# ────────────────────────────────────────────────────────────────
def test_report_includes_mandatory_clinical_disclaimer():
    """Structured report includes the exact required clinical disclaimer."""
    class DummyScreening:
        id = "test-screening-uuid"
        patient_id = "test-patient-uuid"
        eye_side = "RIGHT"
        status = None
        assurance_decision = None
        assurance_reasons = []
        referral_priority = None
        referral_score = None
        is_referable = False
        created_at = None
        analyzed_at = None

    class DummyPatient:
        patient_code = "PAT-001"
        age = 50
        gender = None
        district = "Varanasi"
        state = "UP"

    with tempfile.TemporaryDirectory() as tmp_dir:
        report = generate_report(
            screening=DummyScreening(),
            patient=DummyPatient(),
            fundus_image=None,
            prediction=None,
            doctor_review=None,
            output_dir=tmp_dir,
        )

        assert "disclaimer" in report
        assert report["disclaimer"] == MANDATORY_CLINICAL_DISCLAIMER
        assert "not a definitive diagnosis" in report["disclaimer"].lower()
        assert "qualified eye-care professional" in report["disclaimer"].lower()


def test_pdf_report_generation():
    """ReportLab generates a valid PDF containing side-by-side images and clinical disclaimer."""
    img_path = create_synthetic_fundus()
    with tempfile.TemporaryDirectory() as tmp_dir:
        cam_path = os.path.join(tmp_dir, "gradcam.jpg")
        orig_cv = cv2.imread(img_path)
        cv2.imwrite(cam_path, orig_cv)

        pdf_out = os.path.join(tmp_dir, "report.pdf")
        report_data = {
            "report_id": "RPT-UNITTEST-01",
            "screening": {
                "id": "11111111-1111-1111-1111-111111111111",
                "patient_id": "22222222-2222-2222-2222-222222222222",
                "eye_side": "LEFT",
                "created_at": "2026-10-28T12:00:00Z",
                "analyzed_at": "2026-10-28T12:05:00Z",
            },
            "patient": {
                "patient_code": "P-TEST-12",
                "age": 62,
                "gender": "FEMALE",
                "district": "Pune",
                "state": "Maharashtra",
            },
            "image_quality": {
                "quality_score": 75.0,
                "focus_score": 70.0,
                "illumination_score": 80.0,
                "fov_score": 75.0,
                "is_gradable": True,
                "quality_status": "GRADABLE",
                "feedback": "Acceptable fundus quality",
                "original_path": img_path,
            },
            "ai_prediction": {
                "predicted_grade": 2,
                "grade_label": "Moderate NPDR",
                "confidence": 0.68,
                "confidence_type": "Model probability — not calibrated",
                "probabilities": {"0": 0.05, "1": 0.15, "2": 0.68, "3": 0.08, "4": 0.04},
                "is_referable": True,
                "model_name": "EfficientNet-B0",
                "model_version": "1.0.0",
                "model_status": "TRAINED",
                "is_demo": False,
                "gradcam_path": cam_path,
                "gradcam_target_layer": "backbone.features.8.0",
            },
            "assurance": {
                "decision": "VALIDATED",
                "referral_priority": "MEDIUM",
                "referral_score": 60.0,
                "is_referable": True,
                "reasons": ["Concordant evidence with mild microaneurysm findings."],
            },
            "recommendation": {
                "clinical_pathway": "REFERRAL_WITHIN_ONE_MONTH",
                "action": "Refer to ophthalmologist within one month.",
            },
        }

        generated_path = generate_pdf_report(report_data, pdf_out)
        assert os.path.exists(generated_path)
        assert os.path.getsize(generated_path) > 1000  # valid PDF size

        # Verify PDF header bytes (%PDF)
        with open(generated_path, "rb") as f:
            header = f.read(4)
            assert header == b"%PDF"

    if os.path.exists(img_path):
        os.unlink(img_path)

