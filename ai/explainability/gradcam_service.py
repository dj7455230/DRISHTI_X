"""
DRISHTI-X — Grad-CAM Explainability Service
Feature 13 Implementation.

Provides:
- Authentic Gradient-weighted Class Activation Mapping (Grad-CAM) from EfficientNet-B0.
- Real backward-pass gradients and forward activations from the final convolutional layer.
- Standalone JET heatmap & blended overlay generation.
- Full metadata including target layer, class score, and clinical explainability disclaimers.
"""
import os
import cv2
import numpy as np
import torch
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from ai.classification.model import ModelLoader, DR_GRADE_LABELS, get_model_loader
from training.transforms import get_val_transforms as get_eval_transforms
from ai.explainability.gradcam import GradCAM, overlay_gradcam_on_image

_gradcam_loader: Optional[ModelLoader] = None

def get_gradcam_model_loader(weights_path: Optional[str] = None) -> ModelLoader:
    global _gradcam_loader
    if _gradcam_loader is None or not _gradcam_loader.is_ready_for_real_inference():
        _gradcam_loader = get_model_loader(weights_path=weights_path)
    return _gradcam_loader


class GradCAMService:
    def __init__(self, weights_path: Optional[str] = None):
        self.loader = get_gradcam_model_loader(weights_path=weights_path)
        self.transforms = get_eval_transforms(image_size=224)

    def is_available(self) -> bool:
        return self.loader.is_ready_for_real_inference()

    def generate_explanation(
        self,
        image_path: str,
        output_dir: str,
        target_class: Optional[int] = None,
        alpha: float = 0.45,
    ) -> Dict[str, Any]:
        """
        Executes genuine Grad-CAM generation on EfficientNet-B0.
        Saves:
          - gradcam_heatmap.jpg (JET colormapped heatmap)
          - gradcam_overlay.jpg (Alpha blended overlay on original fundus)
        """
        if not self.is_available():
            raise RuntimeError("EfficientNet-B0 model is not loaded or weights are unavailable.")

        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Input fundus image not found: {image_path}")

        orig_bgr = cv2.imread(image_path)
        if orig_bgr is None:
            raise ValueError(f"Unable to decode fundus image: {image_path}")

        orig_rgb = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2RGB)
        h, w = orig_rgb.shape[:2]

        from PIL import Image
        pil_img = Image.fromarray(orig_rgb)
        input_tensor = self.transforms(pil_img).unsqueeze(0)  # [1, 3, 224, 224]

        # Initialize GradCAM hook on model
        gradcam = GradCAM(self.loader.model)
        target_layer_name = gradcam.target_layer_name

        try:
            heatmap_raw, cls_used, class_score = gradcam.generate(
                input_tensor=input_tensor,
                target_class=target_class,
                device=self.loader.device,
            )
        finally:
            gradcam.remove_hooks()

        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        # 1. Resize heatmap to original image spatial resolution
        heatmap_resized = cv2.resize(heatmap_raw, (w, h))
        heatmap_colored_bgr = cv2.applyColorMap(heatmap_resized, cv2.COLORMAP_JET)
        heatmap_path = str(out_path / "gradcam_heatmap.jpg")
        cv2.imwrite(heatmap_path, heatmap_colored_bgr)

        # 2. Generate Blended Overlay
        overlay_rgb = overlay_gradcam_on_image(orig_rgb, heatmap_raw, alpha=alpha)
        overlay_bgr = cv2.cvtColor(overlay_rgb, cv2.COLOR_RGB2BGR)
        overlay_path = str(out_path / "gradcam_overlay.jpg")
        cv2.imwrite(overlay_path, overlay_bgr)

        grade_label = DR_GRADE_LABELS.get(cls_used, f"Grade {cls_used}")

        return {
            "model": {
                "name": "DrishtiEfficientNet-B0",
                "target_layer": target_layer_name,
                "status": self.loader.status,
                "version": "1.0.0",
            },
            "method": "Grad-CAM (Gradient-Weighted Class Activation Mapping)",
            "target_class": cls_used,
            "grade_label": grade_label,
            "class_activation_score": round(class_score, 4),
            "blend_alpha": alpha,
            "files": {
                "heatmap": "gradcam_heatmap.jpg",
                "overlay": "gradcam_overlay.jpg",
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "disclaimer": (
                "Grad-CAM highlights regions of the fundus image that most influenced "
                "the neural network classifier. It represents mathematical feature attribution, "
                "not confirmed clinical lesion segmentation."
            ),
        }
