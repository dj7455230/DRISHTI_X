"""
DRISHTI-X — Fundus Image Preprocessing Pipeline
Real preprocessing: CLAHE, illumination normalization, crop, resize, normalize.
Keeps original and processed images separately.
"""
import cv2
import numpy as np
from PIL import Image
from pathlib import Path
from typing import Tuple, Optional
import os


def apply_clahe(img_bgr: np.ndarray, clip_limit: float = 2.0,
                tile_grid_size: Tuple[int, int] = (8, 8)) -> np.ndarray:
    """Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) per channel."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    l_eq = clahe.apply(l_channel)
    lab_eq = cv2.merge([l_eq, a_channel, b_channel])
    return cv2.cvtColor(lab_eq, cv2.COLOR_LAB2BGR)


def normalize_illumination(img_bgr: np.ndarray) -> np.ndarray:
    """
    Subtract background illumination gradient using Gaussian blur.
    Standard technique for fundus preprocessing.
    """
    img_float = img_bgr.astype(np.float32)
    # Large kernel captures illumination gradient
    bg = cv2.GaussianBlur(img_float, (101, 101), 0)
    # Subtract background, shift to mid-range
    normalized = img_float - bg + 128.0
    normalized = np.clip(normalized, 0, 255).astype(np.uint8)
    return normalized


def crop_fundus_circle(img_bgr: np.ndarray, margin: float = 0.05) -> np.ndarray:
    """
    Detect the retinal disc boundary and crop to a tight square around it.
    Removes black borders typical in fundus photography.
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 20, 255, cv2.THRESH_BINARY)
    kernel = np.ones((15, 15), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    coords = cv2.findNonZero(thresh)
    if coords is None:
        return img_bgr
    x, y, w, h = cv2.boundingRect(coords)
    # Add margin
    m = int(max(w, h) * margin)
    H, W = img_bgr.shape[:2]
    x1 = max(0, x - m)
    y1 = max(0, y - m)
    x2 = min(W, x + w + m)
    y2 = min(H, y + h + m)
    return img_bgr[y1:y2, x1:x2]


def preprocess_fundus(
    image_path: str,
    output_path: Optional[str] = None,
    target_size: int = 224,
    apply_illumination_norm: bool = True,
    apply_clahe_flag: bool = True,
    crop_circle: bool = True,
) -> Tuple[np.ndarray, str]:
    """
    Full preprocessing pipeline for a fundus image.

    Args:
        image_path: Path to original image.
        output_path: Where to save the enhanced image (optional).
        target_size: Output square size in pixels.
        apply_illumination_norm: Enable background normalization.
        apply_clahe_flag: Enable CLAHE.
        crop_circle: Enable fundus circle crop.

    Returns:
        (enhanced_array_RGB, saved_path_or_empty_string)
    """
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        raise ValueError(f"Cannot read image: {image_path}")

    # Step 1: Crop fundus circle
    if crop_circle:
        img_bgr = crop_fundus_circle(img_bgr)

    # Step 2: Illumination normalization
    if apply_illumination_norm:
        img_bgr = normalize_illumination(img_bgr)

    # Step 3: CLAHE
    if apply_clahe_flag:
        img_bgr = apply_clahe(img_bgr)

    # Step 4: Resize to square
    img_bgr = cv2.resize(img_bgr, (target_size, target_size),
                         interpolation=cv2.INTER_LANCZOS4)

    # Convert to RGB for PIL/PyTorch compatibility
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    saved_path = ""
    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(output_path, cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR))
        saved_path = output_path

    return img_rgb, saved_path


def get_inference_tensor(image_path: str, target_size: int = 224):
    """
    Preprocess image and return a normalized PyTorch tensor ready for EfficientNet.
    Uses exact same transform as validation/evaluation:
    Resize(int(target_size * 1.1)) -> CenterCrop(target_size) -> ImageNet normalization.
    """
    import torch
    from torchvision import transforms

    img = Image.open(image_path).convert("RGB")

    transform = transforms.Compose([
        transforms.Resize(int(target_size * 1.1)),
        transforms.CenterCrop(target_size),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])

    tensor = transform(img).unsqueeze(0)  # shape: [1, 3, H, W]
    return tensor
