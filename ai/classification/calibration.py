"""
DRISHTI-X — Probability Calibration (Temperature Scaling)
Calibrates the EfficientNet-B0 softmax probabilities so that confidence
values better reflect true accuracy.

Reference: Guo et al. "On Calibration of Modern Neural Networks" (2017)

Usage:
    calibrator = TemperatureScaler()
    calibrator.fit(model, val_loader, device)
    calibrator.save("models/weights/temperature.json")

    # At inference:
    calibrated_probs = calibrator.calibrate(raw_logits)
"""
import json
import os
import torch
import torch.nn as nn
import numpy as np
from typing import Optional


class TemperatureScaler:
    """
    Post-hoc calibration via a single temperature parameter T.
    calibrated_probs = softmax(logits / T)

    T > 1 → softer (less confident) → better calibrated
    T < 1 → sharper (more confident)
    T = 1 → no change
    """

    def __init__(self, temperature: float = 1.0):
        self.temperature = temperature
        self._fitted = False

    def fit(
        self,
        model: nn.Module,
        val_loader,
        device: torch.device,
        lr: float = 0.01,
        max_iter: int = 50,
    ) -> "TemperatureScaler":
        """
        Optimise temperature on the validation set using NLL loss.
        """
        model.eval()
        all_logits, all_labels = [], []

        with torch.no_grad():
            for images, labels in val_loader:
                logits = model(images.to(device))
                all_logits.append(logits.cpu())
                all_labels.append(labels.cpu())

        all_logits = torch.cat(all_logits)
        all_labels = torch.cat(all_labels)

        # Optimise T
        T = nn.Parameter(torch.ones(1) * 1.5)
        optimizer = torch.optim.LBFGS([T], lr=lr, max_iter=max_iter)
        criterion = nn.CrossEntropyLoss()

        def eval_fn():
            optimizer.zero_grad()
            loss = criterion(all_logits / T, all_labels)
            loss.backward()
            return loss

        optimizer.step(eval_fn)
        self.temperature = float(T.item())
        self._fitted = True
        print(f"[Calibration] Temperature fitted: T={self.temperature:.4f}")
        return self

    def calibrate(self, logits: torch.Tensor) -> torch.Tensor:
        """Apply temperature scaling to raw logits, return calibrated probabilities."""
        return torch.softmax(logits / self.temperature, dim=-1)

    def calibrate_numpy(self, logits: np.ndarray) -> np.ndarray:
        t = torch.from_numpy(logits).float()
        return self.calibrate(t).numpy()

    def save(self, path: str):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w") as f:
            json.dump({
                "temperature": self.temperature,
                "fitted": self._fitted,
            }, f, indent=2)
        print(f"[Calibration] Saved temperature={self.temperature:.4f} to {path}")

    @classmethod
    def load(cls, path: str) -> "TemperatureScaler":
        with open(path) as f:
            data = json.load(f)
        c = cls(temperature=data["temperature"])
        c._fitted = data.get("fitted", True)
        return c

    @classmethod
    def load_or_default(cls, path: str) -> "TemperatureScaler":
        """Load if available, otherwise return uncalibrated T=1."""
        if os.path.exists(path):
            return cls.load(path)
        return cls(temperature=1.0)


# ── Calibration script ────────────────────────────────────────

def run_calibration(
    weights_path: str = "models/weights/best_model.pth",
    val_csv: str = "datasets/val_split.csv",
    output_path: str = "models/weights/temperature.json",
):
    """Run temperature scaling calibration on val set."""
    import sys
    sys.path.insert(0, ".")
    from ai.classification.model import DrishtiEfficientNet
    from training.dataset import RetinalDataset
    from training.transforms import get_val_transforms
    from torch.utils.data import DataLoader

    if not os.path.exists(weights_path):
        print(f"Weights not found: {weights_path}")
        return

    device = (torch.device("mps")
              if hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
              else torch.device("cpu"))

    model = DrishtiEfficientNet(num_classes=5, pretrained=False)
    ckpt  = torch.load(weights_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt.get("model_state_dict", ckpt))
    model.to(device).eval()

    val_ds = RetinalDataset(val_csv, image_col="image_path", label_col="label",
                            transform=get_val_transforms(224))
    val_loader = DataLoader(val_ds, batch_size=16, shuffle=False, num_workers=0)

    scaler = TemperatureScaler()
    scaler.fit(model, val_loader, device)
    scaler.save(output_path)
    print(f"Calibration complete. T={scaler.temperature:.4f}")


if __name__ == "__main__":
    run_calibration()
