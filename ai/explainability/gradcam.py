"""
DRISHTI-X — Real Grad-CAM Implementation
Generates genuine gradient-weighted class activation maps from EfficientNet-B0.

Requirements:
  - Must use actual model gradients
  - Heatmap must change with different images and predictions
  - Never returns a static/random/hardcoded heatmap
"""
import torch
import torch.nn.functional as F
import numpy as np
import cv2
from typing import Optional, Tuple, Dict
from pathlib import Path


class GradCAM:
    """
    Gradient-weighted Class Activation Mapping for EfficientNet-B0.
    Hooks into the final convolutional layer to capture gradients and activations.
    """

    def __init__(self, model: torch.nn.Module, target_layer_name: Optional[str] = None):
        self.model = model
        self.target_layer_name = target_layer_name
        self.gradients: Optional[torch.Tensor] = None
        self.activations: Optional[torch.Tensor] = None
        self._hooks = []
        self._target_layer = self._find_target_layer()
        self._register_hooks()

    def _find_target_layer(self) -> torch.nn.Module:
        """
        Auto-detect the last convolutional layer for EfficientNet-B0.
        For timm EfficientNet: 'backbone.conv_head' or last block.
        Falls back to scanning for the last Conv2d.
        """
        if self.target_layer_name:
            # Navigate named modules
            for name, module in self.model.named_modules():
                if name == self.target_layer_name:
                    return module

        # Auto-find: last Conv2d in the backbone
        last_conv = None
        for name, module in self.model.named_modules():
            if isinstance(module, torch.nn.Conv2d):
                last_conv = module
                self.target_layer_name = name
        if last_conv is None:
            raise ValueError("Could not find any Conv2d layer in the model.")
        return last_conv

    def _register_hooks(self):
        """Register forward and backward hooks on the target layer."""
        def forward_hook(module, input, output):
            self.activations = output.detach()

        def backward_hook(module, grad_input, grad_output):
            self.gradients = grad_output[0].detach()

        h1 = self._target_layer.register_forward_hook(forward_hook)
        h2 = self._target_layer.register_full_backward_hook(backward_hook)
        self._hooks = [h1, h2]

    def remove_hooks(self):
        for h in self._hooks:
            h.remove()
        self._hooks = []

    def generate(
        self,
        input_tensor: torch.Tensor,
        target_class: Optional[int] = None,
        device: Optional[torch.device] = None,
    ) -> Tuple[np.ndarray, int, float]:
        """
        Generate a Grad-CAM heatmap.

        Args:
            input_tensor: Preprocessed image tensor [1, 3, H, W]
            target_class: DR grade to explain (None = use predicted class)
            device: torch device

        Returns:
            (heatmap_uint8 [H, W], target_class_used, class_score)
            heatmap_uint8: 0–255 grayscale, same spatial size as input
        """
        if device is None:
            device = next(self.model.parameters()).device

        self.model.eval()
        input_tensor = input_tensor.to(device).requires_grad_(True)

        # Forward pass
        output = self.model(input_tensor)
        probs = F.softmax(output, dim=1)

        if target_class is None:
            target_class = int(output.argmax(dim=1).item())

        class_score = float(probs[0, target_class].item())

        # Backward pass for the target class
        self.model.zero_grad()
        score = output[0, target_class]
        score.backward()

        if self.gradients is None or self.activations is None:
            raise RuntimeError(
                "Grad-CAM hooks did not fire. "
                "Check that the target layer is inside the forward computation graph."
            )

        # Pool gradients over spatial dimensions [C]
        pooled_gradients = self.gradients.mean(dim=[0, 2, 3])  # [C]

        # Weight activations [1, C, H, W] → [H, W]
        activations = self.activations[0]  # [C, H, W]
        for i, weight in enumerate(pooled_gradients):
            activations[i] *= weight

        heatmap = activations.mean(dim=0).cpu().numpy()  # [H, W]

        # Handle NaNs or Infs gracefully
        if np.isnan(heatmap).any() or np.isinf(heatmap).any():
            heatmap = np.nan_to_num(heatmap, nan=0.0, posinf=1.0, neginf=0.0)

        # ReLU — only positive influences on target class
        heatmap = np.maximum(heatmap, 0)

        # Safe normalization to 0–255
        h_max = heatmap.max()
        h_min = heatmap.min()
        denom = h_max - h_min
        if denom > 1e-8:
            heatmap = (heatmap - h_min) / denom
        else:
            heatmap = np.zeros_like(heatmap)

        heatmap_uint8 = np.uint8(255 * heatmap)

        # Reset gradients/activations for next call
        self.gradients = None
        self.activations = None

        return heatmap_uint8, target_class, class_score


def overlay_gradcam_on_image(
    original_image_rgb: np.ndarray,
    heatmap: np.ndarray,
    alpha: float = 0.4,
    colormap: int = cv2.COLORMAP_JET,
) -> np.ndarray:
    """
    Overlay a Grad-CAM heatmap on the original fundus image.

    Args:
        original_image_rgb: H×W×3 uint8 RGB image
        heatmap: H×W uint8 heatmap from GradCAM.generate()
        alpha: Heatmap opacity (0–1)
        colormap: OpenCV colormap

    Returns:
        H×W×3 uint8 RGB overlay image
    """
    h, w = original_image_rgb.shape[:2]
    heatmap_resized = cv2.resize(heatmap, (w, h))
    heatmap_colored = cv2.applyColorMap(heatmap_resized, colormap)
    heatmap_rgb = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)

    overlay = cv2.addWeighted(
        original_image_rgb.astype(np.uint8), 1 - alpha,
        heatmap_rgb.astype(np.uint8), alpha,
        0
    )
    return overlay


def generate_and_save_gradcam(
    model: torch.nn.Module,
    input_tensor: torch.Tensor,
    original_image_path: str,
    output_path: str,
    target_class: Optional[int] = None,
    device: Optional[torch.device] = None,
) -> Dict:
    """
    Full pipeline: generate Grad-CAM, overlay on original image, save result.

    Returns:
        dict with: output_path, overlay_path, heatmap_path, target_class, class_score, target_layer
    """
    import cv2

    gradcam = GradCAM(model)
    try:
        heatmap, cls, score = gradcam.generate(input_tensor, target_class, device)
    finally:
        gradcam.remove_hooks()

    # Load original image for overlay
    orig_bgr = cv2.imread(original_image_path)
    if orig_bgr is None:
        raise ValueError(f"Cannot read original image: {original_image_path}")
    orig_rgb = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2RGB)

    # 1. Overlay image (blended with original)
    overlay = overlay_gradcam_on_image(orig_rgb, heatmap, alpha=0.45)

    # 2. Standalone JET colored heatmap
    h, w = orig_rgb.shape[:2]
    heatmap_resized = cv2.resize(heatmap, (w, h))
    heatmap_colored_bgr = cv2.applyColorMap(heatmap_resized, cv2.COLORMAP_JET)

    out_dir = Path(output_path).parent
    out_dir.mkdir(parents=True, exist_ok=True)

    # Write main output file (overlay)
    cv2.imwrite(output_path, cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))

    # Also save explicit overlay alias and standalone heatmap
    overlay_path = str(out_dir / "gradcam_overlay.jpg")
    heatmap_path = str(out_dir / "heatmap.jpg")
    cv2.imwrite(overlay_path, cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR))
    cv2.imwrite(heatmap_path, heatmap_colored_bgr)

    return {
        "output_path": output_path,
        "overlay_path": overlay_path,
        "heatmap_path": heatmap_path,
        "target_class": cls,
        "class_score": round(score, 4),
        "target_layer": gradcam.target_layer_name,
    }
