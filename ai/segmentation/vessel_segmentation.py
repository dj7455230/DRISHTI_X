"""
DRISHTI-X — Retinal Vessel Segmentation (DRIVE dataset) — Phase 26
Implements a U-Net based vessel segmentation pipeline.
Training data: DRIVE dataset (20 training images + masks).

Status: Architecture ready. Run training/train_vessel_unet.py to train.
"""
import os
import numpy as np
import cv2
from typing import Optional, Dict, Any
from pathlib import Path


VESSEL_WEIGHTS = "models/weights/vessel_unet_best.pth"

# Class map: 0=background, 1=vessel
VESSEL_CLASSES = {0: "background", 1: "vessel"}


def get_vessel_unet():
    """Return a U-Net configured for binary vessel segmentation."""
    from ai.segmentation.unet import UNet
    return UNet(in_channels=3, out_channels=2, features=(32, 64, 128, 256))


class VesselSegmenter:
    """
    Retinal vessel segmentation using U-Net trained on DRIVE.
    Falls back to CV heuristic if weights not available.
    """

    def __init__(self, weights_path: str = VESSEL_WEIGHTS):
        self.weights_path = weights_path
        self.model = None
        self.status = "NOT_TRAINED"
        self._try_load()

    def _try_load(self):
        import torch
        if not os.path.exists(self.weights_path):
            print(f"[VesselSegmenter] Weights not found: {self.weights_path}")
            print("[VesselSegmenter] Using CV heuristic fallback.")
            return

        try:
            device = torch.device(
                "mps" if hasattr(torch.backends,"mps") and torch.backends.mps.is_available()
                else "cpu"
            )
            self.model = get_vessel_unet()
            ckpt = torch.load(self.weights_path, map_location=device, weights_only=False)
            self.model.load_state_dict(ckpt.get("model_state_dict", ckpt))
            self.model.to(device).eval()
            self.status = ckpt.get("status", "TRAINED")
            self.device = device
            print(f"[VesselSegmenter] Loaded: {self.weights_path} status={self.status}")
        except Exception as e:
            print(f"[VesselSegmenter] Load failed: {e}. Using CV heuristic.")

    def segment_vessels(
        self,
        image_path: str,
        output_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Segment retinal vessels. Uses U-Net if available, CV heuristic otherwise.
        Returns dict with mask, vessel_density, provenance.
        """
        if self.model is not None and self.status in ("TRAINED", "VALIDATED"):
            return self._unet_segment(image_path, output_path)
        return self._cv_segment(image_path, output_path)

    def _unet_segment(self, image_path: str, output_path: Optional[str]) -> Dict:
        import torch
        from torchvision import transforms
        from PIL import Image

        img = Image.open(image_path).convert("RGB")
        orig_size = img.size  # (W, H)

        tf = transforms.Compose([
            transforms.Resize((512, 512)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        tensor = tf(img).unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(tensor)
        mask = logits.argmax(dim=1)[0].cpu().numpy().astype(np.uint8)

        # Resize back to original
        mask_resized = cv2.resize(mask, orig_size, interpolation=cv2.INTER_NEAREST)
        vessel_density = float(mask_resized.mean())

        if output_path:
            vis = (mask_resized * 255).astype(np.uint8)
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(output_path, vis)

        return {
            "vessel_mask": mask_resized,
            "vessel_density": round(vessel_density, 4),
            "provenance": "UNET_VESSEL_SEGMENTATION",
            "status": self.status,
            "output_path": output_path,
            "disclaimer": "Vessel segmentation output — requires clinical review.",
        }

    def _cv_segment(self, image_path: str, output_path: Optional[str]) -> Dict:
        """CV heuristic vessel segmentation (green channel + CLAHE + threshold)."""
        img_bgr = cv2.imread(image_path)
        if img_bgr is None:
            return {"error": "Cannot load image", "provenance": "CV_HEURISTIC"}

        green = img_bgr[:, :, 1]
        inverted = cv2.bitwise_not(green)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(inverted)

        se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        tophat = cv2.morphologyEx(enhanced, cv2.MORPH_TOPHAT, se)
        _, thresh = cv2.threshold(tophat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Clean up
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        vessel_density = float(cleaned.mean()) / 255.0

        if output_path:
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(output_path, cleaned)

        return {
            "vessel_mask": cleaned,
            "vessel_density": round(vessel_density, 4),
            "provenance": "CV_HEURISTIC",
            "status": "CV_FALLBACK",
            "output_path": output_path,
            "disclaimer": "CV heuristic vessel detection — not U-Net segmentation.",
        }


# Singleton
_segmenter: Optional[VesselSegmenter] = None


def get_vessel_segmenter() -> VesselSegmenter:
    global _segmenter
    if _segmenter is None:
        _segmenter = VesselSegmenter()
    return _segmenter
