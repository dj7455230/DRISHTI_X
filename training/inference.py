"""
DRISHTI-X — Standalone Inference Script
Run single-image inference from command line.

Usage:
    python training/inference.py --image path/to/fundus.jpg
"""
import sys, os, json, argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import torch
import numpy as np

from ai.classification.model import get_model_loader, DR_GRADE_LABELS
from ai.classification.preprocessing import get_inference_tensor
from ai.quality.quality_engine import assess_image_quality


def run_inference(image_path: str, weights_path: str = None):
    loader = get_model_loader(weights_path=weights_path)
    print(loader.get_status_banner())

    quality = assess_image_quality(image_path)
    print(f"Quality: {quality['quality_score']}/100 | Gradable: {quality['is_gradable']}")
    print(f"Feedback: {quality['feedback']}")

    if not quality["is_gradable"]:
        print("RECAPTURE REQUIRED — image not gradable")
        return

    if not loader.is_ready_for_real_inference():
        print("MODEL NOT TRAINED — Cannot run real DR inference")
        print("Train using: python training/train_efficientnet.py")
        return

    tensor = get_inference_tensor(image_path)
    loader.model.eval()
    with torch.no_grad():
        logits = loader.model(tensor.to(loader.device))
    probs = torch.softmax(logits, dim=1)[0].cpu().numpy()
    grade = int(np.argmax(probs))
    conf = float(probs[grade])

    print(f"\nPrediction: Grade {grade} — {DR_GRADE_LABELS[grade]}")
    print(f"Confidence: {conf:.1%}")
    print("Probabilities:")
    for i, p in enumerate(probs):
        bar = "█" * int(p * 20)
        print(f"  Grade {i} ({DR_GRADE_LABELS[i]:<16}): {p:.4f} {bar}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--weights", default="models/weights/best_model.pth")
    args = parser.parse_args()
    run_inference(args.image, args.weights if os.path.exists(args.weights) else None)
