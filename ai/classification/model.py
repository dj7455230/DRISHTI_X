"""
DRISHTI-X — EfficientNet-B0 DR Classification Model
Real architecture using timm (PyTorch Image Models).
Transfer learning from ImageNet weights.

Model Status: NOT_TRAINED until training/train_efficientnet.py is run.
"""
import torch
import torch.nn as nn
from typing import Optional, Dict, Tuple
import json
import os
import hashlib

try:
    import timm
    TIMM_AVAILABLE = True
except ImportError:
    TIMM_AVAILABLE = False

NUM_CLASSES = 5
DR_GRADE_LABELS = {
    0: "No DR",
    1: "Mild NPDR",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR",
}
REFERABLE_GRADES = {2, 3, 4}


class DrishtiEfficientNet(nn.Module):
    """
    EfficientNet-B0 with custom classification head for 5-class DR grading.
    Uses torchvision EfficientNet-B0 backbone with ImageNet pretrained features.
    """

    def __init__(self, num_classes: int = NUM_CLASSES, pretrained: bool = True,
                 dropout: float = 0.3):
        super().__init__()
        self.num_classes = num_classes

        from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights
        weights = EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        base = efficientnet_b0(weights=weights)
        
        # Replace classifier with custom dropout and linear head
        base.classifier = nn.Sequential(
            nn.Dropout(p=dropout, inplace=True),
            nn.Linear(1280, num_classes)
        )
        self.backbone = base

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)

    def get_feature_map(self, x: torch.Tensor) -> torch.Tensor:
        """Return feature maps from the last conv layer (for Grad-CAM)."""
        return self.backbone.features(x)


class ModelLoader:
    """
    Manages model loading with explicit status tracking.
    Never silently switches between real and demo modes.
    """

    MODEL_STATUSES = {
        "NOT_TRAINED": "Model architecture exists but has not been trained on any dataset.",
        "TRAINED": "Model has been trained but not validated on a held-out test set.",
        "VALIDATED": "Model has been trained and evaluated on a held-out test set.",
        "DEMO": "DEMO MODEL — Outputs synthetic predictions. NOT clinical AI.",
    }

    def __init__(self, weights_path: Optional[str] = None,
                 config_path: Optional[str] = None):
        self.weights_path = weights_path
        self.config_path = config_path
        self.model: Optional[DrishtiEfficientNet] = None
        self.status: str = "NOT_TRAINED"
        self.model_version: str = "0.0.0"
        self.weights_hash: Optional[str] = None
        self.training_dataset: Optional[str] = None
        self.device = self._detect_device()

    def _detect_device(self) -> torch.device:
        if torch.cuda.is_available():
            return torch.device("cuda")
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")

    def load(self) -> "ModelLoader":
        """
        Attempt to load trained weights. If unavailable, model stays NOT_TRAINED.
        Always uses weights_only=False for our own checkpoint files.
        """
        import os
        # Build architecture with ImageNet pretrained features
        self.model = DrishtiEfficientNet(pretrained=True)
        self.model.eval()

        if self.weights_path and os.path.exists(self.weights_path):
            try:
                checkpoint = torch.load(
                    self.weights_path,
                    map_location=self.device,
                    weights_only=False      # our own checkpoint — safe
                )
                # Handle both raw state_dict and checkpoint dict
                state_dict = checkpoint.get("model_state_dict", checkpoint)
                try:
                    self.model.load_state_dict(state_dict)
                except Exception:
                    # Fallback if state_dict matches torchvision EfficientNet-B0
                    from torchvision.models import efficientnet_b0
                    class TorchvisionWrapper(nn.Module):
                        def __init__(self, num_classes=5):
                            super().__init__()
                            self.backbone = efficientnet_b0(num_classes=num_classes)
                        def forward(self, x):
                            return self.backbone(x)
                        def get_feature_map(self, x):
                            features = x
                            for layer in list(self.backbone.features.children()):
                                features = layer(features)
                            return features

                    fallback_model = TorchvisionWrapper(num_classes=5)
                    fallback_model.load_state_dict(state_dict)
                    self.model = fallback_model

                self.model.to(self.device)
                self.model.eval()
                self.status = checkpoint.get("status", "TRAINED")
                self.model_version = checkpoint.get("version", "1.0.0")
                self.training_dataset = checkpoint.get("training_dataset", "unknown")
                # Compute hash of weights file for audit trail
                with open(self.weights_path, "rb") as f:
                    self.weights_hash = hashlib.sha256(f.read()).hexdigest()
                print(f"[ModelLoader] Loaded: {self.weights_path}")
                print(f"[ModelLoader] Status: {self.status} | Version: {self.model_version}")
                print(f"[ModelLoader] Sensitivity: {checkpoint.get('val_sensitivity','N/A')}  Specificity: {checkpoint.get('val_specificity','N/A')}")
            except Exception as e:
                print(f"[ModelLoader] WARNING: Could not load weights: {e}")
                self.status = "NOT_TRAINED"
        else:
            if self.weights_path:
                print(f"[ModelLoader] Weights not found at: {self.weights_path}")
            print(f"[ModelLoader] Status: NOT_TRAINED — no trained weights found.")
            self.status = "NOT_TRAINED"

        return self

    def get_status_banner(self) -> str:
        return f"MODEL STATUS: {self.status} — {self.MODEL_STATUSES.get(self.status, '')}"

    def is_ready_for_real_inference(self) -> bool:
        return self.status in ("TRAINED", "VALIDATED")


# Singleton loader — initialized at app startup
_loader: Optional[ModelLoader] = None


def get_model_loader(weights_path: Optional[str] = None) -> ModelLoader:
    global _loader
    if weights_path is None:
        default_candidate = "models/weights/best_model.pth"
        if os.path.exists(default_candidate):
            weights_path = default_candidate
        else:
            # Check relative to repo root
            repo_candidate = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "weights", "best_model.pth")
            if os.path.exists(repo_candidate):
                weights_path = repo_candidate

    if _loader is None:
        _loader = ModelLoader(weights_path=weights_path).load()
    elif (weights_path is not None
          and not _loader.is_ready_for_real_inference()
          and os.path.exists(weights_path)):
        # Weights became available — reload
        _loader = ModelLoader(weights_path=weights_path).load()
    return _loader
