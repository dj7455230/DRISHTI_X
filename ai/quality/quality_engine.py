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
from typing import Dict, Any, Tuple
import io


DR_GRADE_LABELS = {
    0: "No DR",
    1: "Mild NPDR",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR",
}


def assess_image_quality(image_path: str) -> Dict[str, Any]:
    """
    Assess fundus image quality using real CV metrics.

    Args:
        image_path: Path to the fundus image file.

    Returns:
        dict with quality_score, focus_score, illumination_score,
        fov_score, is_gradable, feedback, detail
    """
    result = {
        "quality_score": 0.0,
        "focus_score": 0.0,
        "illumination_score": 0.0,
        "fov_score": 0.0,
        "is_gradable": False,
        "quality_status": "UNGRADABLE",
        "quality_warnings": [],
        "recapture_guidance": [],
        "feedback": "",
        "detail": {},
    }

    # --- Load image ---
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        result["feedback"] = "Could not load image. File may be corrupt or unsupported."
        result["quality_warnings"] = ["Could not load image. File may be corrupt or unsupported."]
        result["recapture_guidance"] = ["Recapture retinal image. Ensure valid JPG or PNG format and that file is not corrupted."]
        return result

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    issues = []

    # ----------------------------------------------------------------
    # 1. FOCUS SCORE — Laplacian variance
    # Fundus cameras produce naturally soft images due to optics.
    # Calibrated thresholds based on APTOS/IDRiD empirical distribution:
    #   < 20  → very blurry (artefact / motion blur / severe defocus)
    #   20–60 → acceptable fundus (most real-world captures)
    #   > 60  → sharp fundus
    # ----------------------------------------------------------------
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    # Use log-scale normalisation: log(var+1)/log(61+1)*100
    # var=5  → ~36%,  var=20 → ~65%,  var=60 → ~100%
    import math
    focus_score = float(np.clip(
        math.log(laplacian_var + 1) / math.log(62) * 100, 0, 100
    ))
    result["focus_score"] = round(focus_score, 1)
    result["detail"]["laplacian_variance"] = round(laplacian_var, 2)
    if focus_score < 20:
        issues.append("Image too blurry. Improve camera focus and recapture.")

    # ----------------------------------------------------------------
    # 2. ILLUMINATION SCORE — Mean brightness + over/under exposure
    # ----------------------------------------------------------------
    mean_brightness = float(np.mean(gray))
    # Ideal fundus brightness ≈ 90–160 out of 255
    if mean_brightness < 30:
        illum_score = 0.0
        issues.append("Image too dark. Check illumination and recapture.")
    elif mean_brightness > 230:
        illum_score = 0.0
        issues.append("Image overexposed. Reduce flash intensity and recapture.")
    else:
        # Score peaks at ~120
        illum_score = float(100 - abs(mean_brightness - 120) / 120 * 100)
        illum_score = max(0.0, illum_score)
    result["illumination_score"] = round(illum_score, 1)
    result["detail"]["mean_brightness"] = round(mean_brightness, 2)

    # ----------------------------------------------------------------
    # 3. FOV SCORE — Retinal area detection using circular mask
    # ----------------------------------------------------------------
    # Fundus images typically have a circular retinal field on dark background
    # Estimate retinal circle as the largest bright region
    _, thresh = cv2.threshold(gray, 20, 255, cv2.THRESH_BINARY)
    # Remove small noise
    kernel = np.ones((15, 15), np.uint8)
    thresh_clean = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    retinal_pixels = int(np.sum(thresh_clean > 0))
    total_pixels = h * w
    retinal_ratio = retinal_pixels / total_pixels
    fov_score = float(np.clip(retinal_ratio * 150, 0, 100))  # scale: 0.67 coverage → 100
    result["fov_score"] = round(fov_score, 1)
    result["detail"]["retinal_coverage_ratio"] = round(retinal_ratio, 3)
    if fov_score < 30:
        issues.append(
            "Insufficient retinal field of view detected. "
            "Move camera slightly farther away or re-center the fundus."
        )

    # ----------------------------------------------------------------
    # 4. RESOLUTION / SIZE CHECK
    # ----------------------------------------------------------------
    min_dim = min(h, w)
    result["detail"]["resolution"] = f"{w}x{h}"
    if min_dim < 256:
        issues.append(f"Image resolution too low ({w}x{h}). Minimum 256×256 required.")

    # ----------------------------------------------------------------
    # 5. OVERALL QUALITY SCORE — Weighted combination
    # ----------------------------------------------------------------
    quality_score = (
        focus_score * 0.40 +
        illum_score * 0.35 +
        fov_score   * 0.25
    )
    quality_score = round(float(np.clip(quality_score, 0, 100)), 1)
    result["quality_score"] = quality_score

    # ----------------------------------------------------------------
    # 6. GRADABILITY DECISION & RECAPTURE GUIDANCE
    # Thresholds calibrated for real fundus cameras (APTOS/IDRiD).
    # Focus >= 20 covers the natural softness of fundus optics.
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
    elif quality_score >= 30.0:
        result["quality_status"] = "BORDERLINE"
    else:
        result["quality_status"] = "UNGRADABLE"

    result["quality_warnings"] = list(issues)

    # Specific actionable recapture recommendations
    recapture_guidance = []
    if focus_score < 20.0:
        recapture_guidance.append(
            "Defocus/motion blur: Re-focus the fundus camera and stabilise the patient's head against the chin rest."
        )
    if mean_brightness < 30.0:
        recapture_guidance.append(
            "Severe underexposure: Increase flash illumination or ensure adequate pupil dilation."
        )
    elif mean_brightness > 230.0:
        recapture_guidance.append(
            "Overexposure/glare: Reduce flash illumination and re-align to eliminate corneal reflection."
        )
    if fov_score < 30.0:
        recapture_guidance.append(
            "Insufficient retinal coverage: Re-center the camera to capture both the optic disc and macula."
        )
    if min_dim < 256:
        recapture_guidance.append(
            "Low resolution: Re-capture using standard diagnostic resolution (at least 256x256 pixels)."
        )

    result["recapture_guidance"] = recapture_guidance

    if not issues:
        result["feedback"] = (
            "Image quality is acceptable for analysis." if is_gradable
            else "Image quality is borderline. Results should be interpreted with caution."
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
