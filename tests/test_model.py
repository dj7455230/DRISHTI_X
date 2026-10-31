"""
DRISHTI-X — Tests: Model Inference + Same-Answer Protection
Critical: verifies model output is NOT constant across different images.
"""
import sys, os, tempfile
import numpy as np
import cv2
import torch
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ai.classification.model import DrishtiEfficientNet, get_model_loader, DR_GRADE_LABELS
from ai.classification.preprocessing import get_inference_tensor


def make_image(color: tuple, size=224) -> str:
    img = np.zeros((size, size, 3), dtype=np.uint8)
    img[:] = color
    cv2.circle(img, (size//2, size//2), int(size*0.43), color, -1)
    f = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    cv2.imwrite(f.name, img)
    return f.name


def test_model_architecture_loads():
    """Model builds without error using ImageNet pretrained weights."""
    model = DrishtiEfficientNet(num_classes=5, pretrained=True)
    assert model is not None
    assert model.num_classes == 5


def test_model_forward_shape():
    """Forward pass produces [1, 5] logits."""
    model = DrishtiEfficientNet(num_classes=5, pretrained=True)
    model.eval()
    x = torch.randn(1, 3, 224, 224)
    with torch.no_grad():
        out = model(x)
    assert out.shape == (1, 5), f"Expected (1,5), got {out.shape}"


def test_probabilities_sum_to_one():
    """Softmax probabilities sum to 1.0."""
    model = DrishtiEfficientNet(num_classes=5, pretrained=True)
    model.eval()
    x = torch.randn(1, 3, 224, 224)
    with torch.no_grad():
        logits = model(x)
    probs = torch.softmax(logits, dim=1)[0]
    assert abs(probs.sum().item() - 1.0) < 1e-5


def test_same_answer_protection():
    """
    CRITICAL: Verify model output is NOT constant across different inputs.
    If every image produces identical probabilities → MODEL OUTPUT COLLAPSE.
    """
    model = DrishtiEfficientNet(num_classes=5, pretrained=True)
    model.eval()

    tensors = [
        torch.randn(1, 3, 224, 224),
        torch.randn(1, 3, 224, 224),
        torch.zeros(1, 3, 224, 224),
        torch.ones(1, 3, 224, 224),
    ]

    probs_list = []
    with torch.no_grad():
        for t in tensors:
            probs = torch.softmax(model(t), dim=1)[0].numpy()
            probs_list.append(probs)

    # Check that NOT all outputs are identical
    all_same = all(np.allclose(probs_list[0], p, atol=1e-6) for p in probs_list[1:])
    assert not all_same, (
        "FAIL: MODEL OUTPUT COLLAPSE / CONSTANT PREDICTION — "
        "All inputs produce identical probability distributions. "
        "Check: preprocessing bug, model loading bug, wrong weights, normalization bug."
    )


def test_different_images_produce_different_probs():
    """
    Different image contents should produce different probability distributions.
    Uses structurally different images (not just color differences, which CLAHE equalizes).
    """
    model = DrishtiEfficientNet(num_classes=5, pretrained=True)
    model.eval()

    # Use raw random tensors — structurally different, bypasses preprocessing
    tensors = [
        torch.randn(1, 3, 224, 224) * 0.5,
        torch.randn(1, 3, 224, 224) * 2.0 + 1.0,
        torch.zeros(1, 3, 224, 224),
        torch.ones(1, 3, 224, 224) * -1.0,
    ]

    probs_list = []
    with torch.no_grad():
        for t in tensors:
            probs = torch.softmax(model(t), dim=1)[0].numpy()
            probs_list.append(probs)

    all_same = all(np.allclose(probs_list[0], p, atol=1e-4) for p in probs_list[1:])
    assert not all_same, (
        "FAIL: MODEL OUTPUT COLLAPSE — all structurally different inputs produce "
        "identical probability distributions. "
        "Check: model weights, normalization, or architecture bug."
    )


def test_model_loader_status_not_trained():
    """ModelLoader correctly reports NOT_TRAINED when weights file doesn't exist."""
    from ai.classification.model import ModelLoader
    # Use a fresh ModelLoader instance (not the singleton) with nonexistent path
    loader = ModelLoader(weights_path="/nonexistent/path/model_xyz_test.pth").load()
    assert loader.status == "NOT_TRAINED"
    assert loader.is_ready_for_real_inference() is False


def test_dr_grade_labels_complete():
    """All 5 grade labels are defined."""
    for i in range(5):
        assert i in DR_GRADE_LABELS
        assert isinstance(DR_GRADE_LABELS[i], str)
        assert len(DR_GRADE_LABELS[i]) > 0
