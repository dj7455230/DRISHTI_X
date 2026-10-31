"""
DRISHTI-X — Image Quality Assessment Engine
Real computer-vision based quality scoring.
No model required — uses signal processing metrics.

Outputs:
  - quality_score: 0–100 overall
  - focus_score: 0–100 (Laplacian variance)
  - illumination_score: 0–100 (histogram analysis)
  - fov_score: 0–100 (retinal area coverage)
  - is_gradable: bool
  - feedback: human-readable string
"""
import cv2
import numpy as np
from PIL import Image
from typing import Dict, Any, Tuple, List
from datetime import datetime, timezone
import io
import math


DR_GRADE_LABELS = {
    0: "No DR",
    1: "Mild NPDR",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR",
}


def assess_image_quality(image_input) -> Dict[str, Any]:
    """
    Assess fundus image quality using real CV metrics.

    Args:
        image_input: File path (str/Path) or raw bytes of the fundus image.

    Returns:
        dict with quality_score, focus_score, illumination_score, contrast_score,
        fov_score, is_gradable, quality_category, quality_status,
        detected_issues, recapture_guidance, feedback, detail
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    result = {
        "quality_score": 0.0,
        "focus_score": 0.0,
        "illumination_score": 0.0,
        "contrast_score": 0.0,
        "fov_score": 0.0,
        "is_gradable": False,
        "quality_category": "Poor",
        "quality_status": "UNGRADABLE",
        "quality_warnings": [],
        "detected_issues": [],
        "recapture_guidance": [],
        "feedback": "",
        "quality_engine_version": "2.1.0",
        "processed_at": timestamp,
        "detail": {},
    }

    # --- Load image (support both path string and raw bytes) ---
    if isinstance(image_input, (bytes, bytearray)):
        img_bgr = cv2.imdecode(np.frombuffer(image_input, np.uint8), cv2.IMREAD_COLOR)
    else:
        img_bgr = cv2.imread(str(image_input))

    if img_bgr is None:
        result["feedback"] = "Could not load image. File may be corrupt or unsupported."
        result["quality_warnings"] = ["Could not load image. File may be corrupt or unsupported."]
        result["recapture_guidance"] = ["Recapture retinal image. Ensure valid JPG or PNG format and that file is not corrupted."]
        result["detected_issues"] = [{
            "issue_type": "CORRUPT_OR_UNSUPPORTED",
            "title": "Unreadable File",
            "reason": "Could not decode image stream. File may be corrupt, truncated, or unsupported format.",
            "recommendations": ["Ensure file is a valid JPG or PNG.", "Re-export or re-transfer from camera.", "Capture a new image."],
        }]
        return result

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    issues = []
    detected_issues = []

    # ----------------------------------------------------------------
    # 1. FOCUS SCORE — Laplacian variance
    # Fundus cameras produce naturally soft images due to optics.
    # Calibrated thresholds based on APTOS/IDRiD empirical distribution:
    #   < 20  → very blurry (artefact / motion blur / severe defocus)
    #   20–60 → acceptable fundus (most real-world captures)
    #   > 60  → sharp fundus
    # ----------------------------------------------------------------
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    focus_score = float(np.clip(
        math.log(laplacian_var + 1) / math.log(62) * 100, 0, 100
    ))
    result["focus_score"] = round(focus_score, 1)
    result["detail"]["laplacian_variance"] = round(laplacian_var, 2)
    if focus_score < 20:
        issues.append("Image too blurry. Retinal blood vessels and fine structures may not be clearly visible.")
        detected_issues.append({
            "issue_type": "BLUR",
            "title": "Blur Detected",
            "reason": "The retinal image appears blurry. Retinal blood vessels and fine structures may not be clearly visible.",
            "recommendations": [
                "Stabilize the fundus camera.",
                "Ask the patient to remain still.",
                "Refocus the camera.",
                "Capture another image.",
            ]
        })

    # ----------------------------------------------------------------
    # 2. ILLUMINATION SCORE — Mean brightness + over/under exposure
    # ----------------------------------------------------------------
    mean_brightness = float(np.mean(gray))
    if mean_brightness < 30:
        illum_score = 0.0
        issues.append("Image too dark. Check illumination and recapture.")
        detected_issues.append({
            "issue_type": "LOW_ILLUMINATION",
            "title": "Low Illumination",
            "reason": "The retinal image appears too dark.",
            "recommendations": [
                "Adjust camera illumination.",
                "Check camera alignment.",
                "Capture a new image with appropriate exposure.",
            ]
        })
    elif mean_brightness > 230:
        illum_score = 0.0
        issues.append("Image overexposed. Bright regions may hide retinal details.")
        detected_issues.append({
            "issue_type": "EXCESSIVE_ILLUMINATION",
            "title": "Excessive Illumination",
            "reason": "Bright regions may be hiding retinal details.",
            "recommendations": [
                "Adjust exposure.",
                "Avoid excessive illumination.",
                "Capture another image.",
            ]
        })
    else:
        illum_score = float(100 - abs(mean_brightness - 120) / 120 * 100)
        illum_score = max(0.0, illum_score)
    result["illumination_score"] = round(illum_score, 1)
    result["detail"]["mean_brightness"] = round(mean_brightness, 2)

    # ----------------------------------------------------------------
    # 3. FOV SCORE — Retinal area detection using circular mask
    # ----------------------------------------------------------------
    _, thresh = cv2.threshold(gray, 20, 255, cv2.THRESH_BINARY)
    kernel = np.ones((15, 15), np.uint8)
    thresh_clean = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    retinal_pixels = int(np.sum(thresh_clean > 0))
    total_pixels = h * w
    retinal_ratio = retinal_pixels / total_pixels
    fov_score = float(np.clip(retinal_ratio * 150, 0, 100))
    result["fov_score"] = round(fov_score, 1)
    result["detail"]["retinal_coverage_ratio"] = round(retinal_ratio, 3)
    if fov_score < 30:
        issues.append(
            "Insufficient retinal field of view detected. "
            "Move camera slightly farther away or re-center the fundus."
        )
        detected_issues.append({
            "issue_type": "POOR_FOV",
            "title": "Poor Field of View",
            "reason": "The visible retinal area is insufficient.",
            "recommendations": [
                "Reposition the camera.",
                "Center the retinal field.",
                "Ensure sufficient retinal visibility.",
            ]
        })

    # ----------------------------------------------------------------
    # 4. CONTRAST SCORE — Standard deviation of retinal pixels
    # ----------------------------------------------------------------
    retinal_region = gray[thresh_clean > 0] if np.sum(thresh_clean > 0) > 0 else gray
    contrast_std = float(np.std(retinal_region)) if len(retinal_region) > 0 else 0.0
    contrast_score = float(np.clip((contrast_std / 45.0) * 100.0, 0, 100))
    result["contrast_score"] = round(contrast_score, 1)
    result["detail"]["contrast_std"] = round(contrast_std, 2)
    if contrast_score < 25.0 and mean_brightness >= 30 and mean_brightness <= 230:
        issues.append("Low contrast. Retinal structures are difficult to distinguish.")
        detected_issues.append({
            "issue_type": "LOW_CONTRAST",
            "title": "Low Contrast",
            "reason": "Retinal structures are difficult to distinguish.",
            "recommendations": [
                "Check focus and illumination.",
                "Adjust image acquisition settings.",
                "Capture a clearer image.",
            ]
        })

    # ----------------------------------------------------------------
    # 5. RESOLUTION / SIZE CHECK
    # ----------------------------------------------------------------
    min_dim = min(h, w)
    result["detail"]["resolution"] = f"{w}x{h}"
    if min_dim < 256:
        issues.append(f"Image resolution too low ({w}x{h}). Minimum 256×256 required.")
        detected_issues.append({
            "issue_type": "LOW_RESOLUTION",
            "title": "Low Resolution",
            "reason": f"Image resolution ({w}x{h}) is insufficient for reliable AI analysis.",
            "recommendations": [
                "Configure camera for full diagnostic resolution.",
                "Avoid compression or thumbnail exports.",
                "Re-upload or recapture in standard diagnostic resolution.",
            ]
        })

    # ----------------------------------------------------------------
    # 6. OVERALL QUALITY SCORE — Weighted combination
    # ----------------------------------------------------------------
    quality_score = (
        focus_score * 0.35 +
        illum_score * 0.30 +
        contrast_score * 0.15 +
        fov_score   * 0.20
    )
    quality_score = round(float(np.clip(quality_score, 0, 100)), 1)
    result["quality_score"] = quality_score

    # ----------------------------------------------------------------
    # 7. GRADABILITY DECISION & QUALITY CATEGORIES
    # ----------------------------------------------------------------
    is_gradable = (
        quality_score >= 35.0 and
        focus_score >= 20.0 and
        illum_score >= 20.0 and
        fov_score >= 20.0 and
        min_dim >= 256
    )
    result["is_gradable"] = is_gradable

    if is_gradable:
        result["quality_status"] = "GRADABLE"
        result["quality_category"] = "Good"
    elif quality_score >= 30.0:
        result["quality_status"] = "BORDERLINE"
        result["quality_category"] = "Borderline"
    else:
        result["quality_status"] = "UNGRADABLE"
        result["quality_category"] = "Poor"

    result["quality_warnings"] = list(issues)
    result["detected_issues"] = detected_issues

    # Specific actionable recapture recommendations
    recapture_guidance = []
    for issue in detected_issues:
        for rec in issue["recommendations"]:
            if rec not in recapture_guidance:
                recapture_guidance.append(rec)

    if not recapture_guidance and not is_gradable:
        recapture_guidance.append("Capture another image following standard fundus photography positioning guidelines.")

    result["recapture_guidance"] = recapture_guidance

    if not issues:
        result["feedback"] = (
            "Image quality is Good (suitable for AI analysis)." if is_gradable
            else "Image quality is Borderline. Results should be interpreted with caution."
        )
    else:
        result["feedback"] = " | ".join(issues)

    return result


def validate_image_file(file_bytes: bytes, filename: str) -> Tuple[bool, str]:
    """
    Validate that uploaded file is a real, readable image.

    Returns:
        (is_valid, error_message)
    """
    allowed_extensions = {".jpg", ".jpeg", ".png", ".tiff", ".bmp"}
    import os
    ext = os.path.splitext(filename.lower())[1]
    if ext not in allowed_extensions:
        return False, f"Unsupported file format '{ext}'. Allowed: jpg, jpeg, png, tiff, bmp."

    if len(file_bytes) == 0:
        return False, "Uploaded file is empty."

    if len(file_bytes) > 20 * 1024 * 1024:
        return False, "File exceeds 20MB size limit."

    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.verify()
    except Exception as e:
        return False, f"File appears to be corrupt or not a valid image: {str(e)}"

    try:
        img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        w, h = img.size
        if w < 64 or h < 64:
            return False, f"Image dimensions too small ({w}x{h}). Minimum 64×64."
    except Exception as e:
        return False, f"Could not read image dimensions: {str(e)}"

    return True, ""
