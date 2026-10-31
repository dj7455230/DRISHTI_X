"""
DRISHTI-X — Lesion Evidence Analysis
Uses U-Net segmentation when trained weights are available.
Falls back to CV heuristic pipeline otherwise.

Provenance always declared. Terminology: "potential candidate" never "confirmed".
"""
import cv2
import numpy as np
from typing import Dict, Any, Optional
from pathlib import Path
import os

CV_PROVENANCE   = "CV_PIPELINE_HEURISTIC"
UNET_PROVENANCE = "UNET_SEGMENTATION"

# Resolve U-Net weights path from config or environment
def _get_unet_weights_path() -> str:
    try:
        from app.core.config import settings
        return os.path.join(settings.model_weights_path, "unet_lesion.pth")
    except Exception:
        return os.environ.get("MODEL_DIR", "models/weights") + "/unet_lesion.pth"

# Class indices in U-Net output
UNET_CLASSES = {0: "background", 1: "microaneurysm", 2: "hemorrhage", 3: "hard_exudate"}


# ── U-Net inference ───────────────────────────────────────────

def _try_unet_inference(image_path: str) -> Optional[Dict[str, Any]]:
    """
    Attempt U-Net lesion segmentation if weights are available.
    Returns structured lesion dict or None if unavailable.
    """
    UNET_WEIGHTS = _get_unet_weights_path()
    if not os.path.exists(UNET_WEIGHTS):
        return None

    try:
        import torch
        from torchvision import transforms
        from ai.segmentation.unet import UNetLoader

        loader = UNetLoader(weights_path=UNET_WEIGHTS)
        if not loader.is_ready():
            return None

        img = cv2.imread(image_path)
        if img is None:
            return None

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        from PIL import Image
        pil_img = Image.fromarray(img_rgb)

        tf = transforms.Compose([
            transforms.Resize((512, 512)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        tensor = tf(pil_img).unsqueeze(0)
        logits = loader.predict_mask(tensor)                 # [1,4,H,W]
        mask   = logits.argmax(dim=1)[0].cpu().numpy()      # [H,W] values 0-3

        results = {}
        for cls_idx, cls_name in UNET_CLASSES.items():
            if cls_idx == 0:
                continue
            binary = (mask == cls_idx).astype(np.uint8)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            count = len(contours)
            area  = float(np.sum(binary))
            results[cls_name] = {
                "count": count,
                "total_area_px": round(area, 1),
                "label": f"U-Net detected {cls_name} candidates",
                "provenance": UNET_PROVENANCE,
            }

        evidence_score = compute_lesion_evidence_score(
            ma_count      = results.get("microaneurysm", {}).get("count", 0),
            hem_count     = results.get("hemorrhage",    {}).get("count", 0),
            exudate_count = results.get("hard_exudate",  {}).get("count", 0),
        )

        # Save mask
        mask_colored = np.zeros((*mask.shape, 3), dtype=np.uint8)
        mask_colored[mask == 1] = [0,   255, 0]    # MA: green
        mask_colored[mask == 2] = [255, 0,   0]    # Hem: red
        mask_colored[mask == 3] = [0,   0, 255]    # Exudate: blue

        return {
            "microaneurysms": results.get("microaneurysm", {"count": 0, "total_area_px": 0.0}),
            "hemorrhages":    results.get("hemorrhage",    {"count": 0, "total_area_px": 0.0}),
            "hard_exudates":  results.get("hard_exudate",  {"count": 0, "total_area_px": 0.0}),
            "lesion_evidence_score": evidence_score,
            "provenance":     UNET_PROVENANCE,
            "_mask_colored":  mask_colored,
            "disclaimer": (
                "Lesion candidates detected by U-Net segmentation. "
                "Requires ophthalmologist review. Not clinically confirmed."
            ),
        }

    except Exception as e:
        print(f"[U-Net inference] Failed: {e} — falling back to CV heuristic")
        return None


# ── CV heuristic detectors ────────────────────────────────────

def detect_microaneurysms(img_gray: np.ndarray) -> Dict[str, Any]:
    kernel  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    tophat  = cv2.morphologyEx(img_gray, cv2.MORPH_TOPHAT, kernel)
    _, thresh = cv2.threshold(tophat, 15, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = [c for c in contours if 3 < cv2.contourArea(c) < 80]
    return {
        "count": len(candidates),
        "total_area_px": round(sum(cv2.contourArea(c) for c in candidates), 1),
        "label": "Potential microaneurysm candidates",
        "provenance": CV_PROVENANCE,
    }


def detect_hemorrhages(img_gray: np.ndarray, mask: Optional[np.ndarray] = None) -> Dict[str, Any]:
    inverted = cv2.bitwise_not(img_gray)
    thresh   = cv2.adaptiveThreshold(inverted, 255,
                    cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 5)
    if mask is not None:
        thresh = cv2.bitwise_and(thresh, thresh, mask=mask)
    kernel  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = [c for c in contours if 80 < cv2.contourArea(c) < 5000]
    return {
        "count": len(candidates),
        "total_area_px": round(sum(cv2.contourArea(c) for c in candidates), 1),
        "label": "Potential hemorrhage candidates",
        "provenance": CV_PROVENANCE,
    }


def detect_hard_exudates(img_rgb: np.ndarray) -> Dict[str, Any]:
    r = img_rgb[:, :, 0].astype(np.float32)
    g = img_rgb[:, :, 1].astype(np.float32)
    bright_mask = ((r > 180) & (g > 160)).astype(np.uint8) * 255
    h, w = img_rgb.shape[:2]
    cv2.circle(bright_mask, (int(w * 0.7), int(h * 0.5)), int(w * 0.08), 0, -1)
    kernel  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    cleaned = cv2.morphologyEx(bright_mask, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = [c for c in contours if 50 < cv2.contourArea(c) < 8000]
    return {
        "count": len(candidates),
        "total_area_px": round(sum(cv2.contourArea(c) for c in candidates), 1),
        "label": "Potential hard exudate candidates",
        "provenance": CV_PROVENANCE,
    }


def get_retinal_mask(img_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 20, 255, cv2.THRESH_BINARY)
    kernel  = np.ones((15, 15), np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)


def compute_lesion_evidence_score(ma_count: int, hem_count: int, exudate_count: int) -> float:
    score  = min(ma_count     / 50.0,  0.30)
    score += min(hem_count    / 20.0,  0.40)
    score += min(exudate_count / 10.0, 0.30)
    return round(min(score, 1.0), 3)


# ── Main entry point ──────────────────────────────────────────

def analyze_lesions(
    image_path: str,
    output_mask_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full lesion analysis pipeline.
    Tries U-Net first (if weights available), falls back to CV heuristic.
    All findings labeled as 'potential' — requires ophthalmologist review.
    """
    # Try U-Net
    unet_result = _try_unet_inference(image_path)
    if unet_result is not None:
        if output_mask_path:
            mask_colored = unet_result.pop("_mask_colored", None)
            if mask_colored is not None:
                Path(output_mask_path).parent.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(output_mask_path, mask_colored)
        unet_result["neovascularization_signal"] = False
        unet_result["neovascularization_note"] = (
            "Neovascularization detection not yet implemented in U-Net."
        )
        return unet_result

    # CV heuristic fallback
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        return {"error": "Could not load image", "provenance": CV_PROVENANCE}

    img_rgb      = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_gray     = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    retinal_mask = get_retinal_mask(img_bgr)

    ma_result      = detect_microaneurysms(img_gray)
    hem_result     = detect_hemorrhages(img_gray, mask=retinal_mask)
    exudate_result = detect_hard_exudates(img_rgb)

    evidence_score = compute_lesion_evidence_score(
        ma_result["count"], hem_result["count"], exudate_result["count"]
    )

    if output_mask_path:
        combined = np.zeros_like(img_bgr)
        tophat = cv2.morphologyEx(img_gray, cv2.MORPH_TOPHAT,
                     cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11,11)))
        _, ma_thresh = cv2.threshold(tophat, 15, 255, cv2.THRESH_BINARY)
        combined[:, :, 1] = ma_thresh
        Path(output_mask_path).parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(output_mask_path, combined)

    return {
        "microaneurysms":           ma_result,
        "hemorrhages":              hem_result,
        "hard_exudates":            exudate_result,
        "neovascularization_signal": False,
        "neovascularization_note":  "Requires trained model — NOT_AVAILABLE",
        "lesion_evidence_score":    evidence_score,
        "provenance":               CV_PROVENANCE,
        "disclaimer": (
            "All lesion detections are model-indicated candidates (CV heuristic). "
            "U-Net weights not yet available. "
            "Requires ophthalmologist review. Not clinically confirmed."
        ),
    }
