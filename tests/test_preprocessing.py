"""
DRISHTI-X — Tests: Preprocessing Pipeline
"""
import sys, os, tempfile
import numpy as np
import cv2
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ai.classification.preprocessing import (
    apply_clahe, normalize_illumination, crop_fundus_circle,
    preprocess_fundus, get_inference_tensor
)


def make_fundus_bgr(size=256) -> np.ndarray:
    img = np.zeros((size, size, 3), dtype=np.uint8)
    cv2.circle(img, (size//2, size//2), int(size*0.43), (30, 100, 30), -1)
    return img


def test_clahe_preserves_shape():
    img = make_fundus_bgr()
    out = apply_clahe(img)
    assert out.shape == img.shape
    assert out.dtype == np.uint8


def test_normalize_illumination_preserves_shape():
    img = make_fundus_bgr()
    out = normalize_illumination(img)
    assert out.shape == img.shape


def test_crop_fundus_circle_returns_array():
    img = make_fundus_bgr(256)
    out = crop_fundus_circle(img)
    assert out.ndim == 3
    assert out.shape[2] == 3


def test_preprocess_fundus_output_size():
    img = make_fundus_bgr(512)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        cv2.imwrite(f.name, img)
        path = f.name
    try:
        arr, _ = preprocess_fundus(path, target_size=224)
        assert arr.shape == (224, 224, 3)
    finally:
        os.unlink(path)


def test_preprocess_saves_file():
    img = make_fundus_bgr(256)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as fin:
        cv2.imwrite(fin.name, img)
        in_path = fin.name
    out_path = in_path.replace(".jpg", "_enhanced.jpg")
    try:
        arr, saved = preprocess_fundus(in_path, output_path=out_path, target_size=224)
        assert os.path.exists(saved)
    finally:
        for p in [in_path, out_path]:
            if os.path.exists(p): os.unlink(p)


def test_inference_tensor_shape():
    img = make_fundus_bgr(256)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        cv2.imwrite(f.name, img)
        path = f.name
    try:
        tensor = get_inference_tensor(path, target_size=224)
        assert tensor.shape == (1, 3, 224, 224)
        assert str(tensor.dtype) == "torch.float32"
    finally:
        os.unlink(path)
