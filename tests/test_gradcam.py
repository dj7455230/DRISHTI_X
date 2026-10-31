"""
DRISHTI-X — Tests: Grad-CAM
Verifies heatmaps are real gradient-based, not static/random.
"""
import sys, os, tempfile
import numpy as np
import cv2
import torch
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ai.classification.model import DrishtiEfficientNet
from ai.classification.preprocessing import get_inference_tensor
from ai.explainability.gradcam import GradCAM, overlay_gradcam_on_image


def make_image(color=(40, 120, 40), size=224) -> str:
    img = np.zeros((size, size, 3), dtype=np.uint8)
    cv2.circle(img, (size//2, size//2), int(size*0.43), color, -1)
    f = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    cv2.imwrite(f.name, img)
    return f.name


@pytest.fixture(scope="module")
def model():
    m = DrishtiEfficientNet(num_classes=5, pretrained=True)
    m.eval()
    return m


def test_gradcam_hooks_register(model):
    """GradCAM finds a valid target layer and registers hooks."""
    gc = GradCAM(model)
    assert gc.target_layer_name is not None
    assert len(gc._hooks) == 2
    gc.remove_hooks()


def test_gradcam_target_layer_is_conv(model):
    """Target layer should be a Conv2d."""
    gc = GradCAM(model)
    assert isinstance(gc._target_layer, torch.nn.Conv2d)
    gc.remove_hooks()


def test_gradcam_generates_heatmap(model):
    """Grad-CAM produces a valid heatmap array."""
    p = make_image()
    try:
        t = get_inference_tensor(p)
        gc = GradCAM(model)
        heatmap, cls, score = gc.generate(t)
        gc.remove_hooks()

        assert heatmap.ndim == 2
        assert heatmap.dtype == np.uint8
        assert 0 <= heatmap.min() and heatmap.max() <= 255
        assert 0 <= cls <= 4
        assert 0.0 <= score <= 1.0
    finally:
        os.unlink(p)


def test_gradcam_differs_per_image(model):
    """
    Critical: Grad-CAM heatmap must differ for different input images.
    A static heatmap would be identical for all inputs.
    """
    paths = [make_image((40, 120, 40)), make_image((120, 40, 40))]
    heatmaps = []
    try:
        for p in paths:
            t = get_inference_tensor(p)
            gc = GradCAM(model)
            hm, _, _ = gc.generate(t)
            gc.remove_hooks()
            heatmaps.append(hm.astype(np.float32))
    finally:
        for p in paths:
            if os.path.exists(p): os.unlink(p)

    # Heatmaps should not be pixel-identical
    assert not np.array_equal(heatmaps[0], heatmaps[1]), (
        "FAIL: Grad-CAM produces identical heatmaps for different inputs — "
        "this indicates a static/broken heatmap."
    )


def test_gradcam_overlay_shape():
    """Overlay output matches original image shape."""
    h, w = 224, 224
    orig = np.random.randint(0, 255, (h, w, 3), dtype=np.uint8)
    hm = np.random.randint(0, 255, (32, 32), dtype=np.uint8)
    out = overlay_gradcam_on_image(orig, hm)
    assert out.shape == (h, w, 3)
    assert out.dtype == np.uint8


def test_gradcam_hooks_removed_cleanly(model):
    """Removing hooks doesn't affect model forward pass."""
    gc = GradCAM(model)
    gc.remove_hooks()
    x = torch.randn(1, 3, 224, 224)
    with torch.no_grad():
        out = model(x)
    assert out.shape == (1, 5)
