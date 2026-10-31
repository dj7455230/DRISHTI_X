"""
DRISHTI-X — Tests: Image Quality Engine
"""
import sys, os, tempfile
import numpy as np
import cv2
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ai.quality.quality_engine import assess_image_quality, validate_image_file


def make_synthetic_fundus(size=512, brightness=120) -> str:
    img = np.zeros((size, size, 3), dtype=np.uint8)
    cv2.circle(img, (size//2, size//2), int(size*0.43), (0, brightness, 0), -1)
    noise = np.random.randint(0, 15, img.shape, dtype=np.uint8)
    img = cv2.add(img, noise)
    f = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    cv2.imwrite(f.name, img)
    return f.name


def test_quality_score_range():
    path = make_synthetic_fundus()
    try:
        result = assess_image_quality(path)
        assert 0 <= result["quality_score"] <= 100
        assert 0 <= result["focus_score"] <= 100
        assert 0 <= result["illumination_score"] <= 100
        assert 0 <= result["fov_score"] <= 100
        assert isinstance(result["is_gradable"], bool)
        assert isinstance(result["feedback"], str)
    finally:
        os.unlink(path)


def test_dark_image_not_gradable():
    img = np.zeros((512, 512, 3), dtype=np.uint8)
    f = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    cv2.imwrite(f.name, img)
    try:
        result = assess_image_quality(f.name)
        assert result["is_gradable"] is False
        assert result["illumination_score"] == 0.0
    finally:
        os.unlink(f.name)


def test_good_image_is_gradable():
    path = make_synthetic_fundus(size=512, brightness=120)
    try:
        result = assess_image_quality(path)
        assert result["is_gradable"] is True
        assert result["quality_score"] >= 50
    finally:
        os.unlink(path)


def test_corrupt_image_returns_zero():
    f = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    f.write(b"not an image")
    f.close()
    try:
        result = assess_image_quality(f.name)
        assert result["quality_score"] == 0.0
    finally:
        os.unlink(f.name)


def test_validate_valid_image():
    path = make_synthetic_fundus()
    with open(path, "rb") as f:
        data = f.read()
    os.unlink(path)
    ok, err = validate_image_file(data, "test.jpg")
    assert ok is True
    assert err == ""


def test_validate_bad_extension():
    ok, err = validate_image_file(b"data", "file.pdf")
    assert ok is False
    assert "pdf" in err.lower() or "format" in err.lower()


def test_validate_empty_file():
    ok, err = validate_image_file(b"", "file.jpg")
    assert ok is False


def test_validate_corrupt_bytes():
    ok, err = validate_image_file(b"\x00\x01\x02\x03", "file.jpg")
    assert ok is False
