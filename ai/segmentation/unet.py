"""
DRISHTI-X — U-Net for Retinal Lesion Segmentation
Architecture: standard U-Net with 4 encoder/decoder stages.
Target lesions: microaneurysms, hemorrhages, hard exudates.

Status: NOT_TRAINED — architecture ready, training requires IDRiD
segmentation ground-truth masks (datasets/idrid/A. Segmentation/).

Usage once trained:
    model = UNet(in_channels=3, out_channels=4)  # bg + 3 lesion types
    checkpoint = torch.load("models/weights/unet_lesion.pth")
    model.load_state_dict(checkpoint["model_state_dict"])
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional


class DoubleConv(nn.Module):
    """Two consecutive 3×3 Conv → BN → ReLU blocks."""
    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.block(x)


class Down(nn.Module):
    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(nn.MaxPool2d(2), DoubleConv(in_ch, out_ch))

    def forward(self, x):
        return self.block(x)


class Up(nn.Module):
    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.up   = nn.ConvTranspose2d(in_ch, in_ch // 2, kernel_size=2, stride=2)
        self.conv = DoubleConv(in_ch, out_ch)

    def forward(self, x1, x2):
        x1 = self.up(x1)
        # Pad if sizes differ
        dh = x2.size(2) - x1.size(2)
        dw = x2.size(3) - x1.size(3)
        x1 = F.pad(x1, [dw // 2, dw - dw // 2, dh // 2, dh - dh // 2])
        return self.conv(torch.cat([x2, x1], dim=1))


class UNet(nn.Module):
    """
    Standard U-Net for retinal lesion segmentation.

    Args:
        in_channels:  3 (RGB fundus image)
        out_channels: number of segmentation classes
                      4 = background + MA + hemorrhage + exudate
        features:     channel widths at each encoder stage
    """
    def __init__(
        self,
        in_channels:  int = 3,
        out_channels: int = 4,
        features:     tuple = (64, 128, 256, 512),
    ):
        super().__init__()
        self.inc   = DoubleConv(in_channels, features[0])
        self.down1 = Down(features[0], features[1])
        self.down2 = Down(features[1], features[2])
        self.down3 = Down(features[2], features[3])
        self.down4 = Down(features[3], features[3] * 2)  # bottleneck

        self.up1 = Up(features[3] * 2, features[3])
        self.up2 = Up(features[3],     features[2])
        self.up3 = Up(features[2],     features[1])
        self.up4 = Up(features[1],     features[0])

        self.out_conv = nn.Conv2d(features[0], out_channels, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        x  = self.up1(x5, x4)
        x  = self.up2(x,  x3)
        x  = self.up3(x,  x2)
        x  = self.up4(x,  x1)
        return self.out_conv(x)

    def parameter_count(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


# ── U-Net loader with explicit status ─────────────────────────

class UNetLoader:
    """
    Explicit status tracking for U-Net — mirrors EfficientNet ModelLoader.
    Status: NOT_TRAINED until unet_lesion.pth is present.
    """
    def __init__(self, weights_path: Optional[str] = None):
        self.weights_path = weights_path
        self.model  = UNet(in_channels=3, out_channels=4)
        self.status = "NOT_TRAINED"
        self.device = torch.device(
            "cuda" if torch.cuda.is_available() else
            "mps"  if (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()) else
            "cpu"
        )
        self._try_load()

    def _try_load(self):
        import os
        if self.weights_path and os.path.exists(self.weights_path):
            try:
                ckpt = torch.load(self.weights_path, map_location=self.device,
                                  weights_only=False)
                state_dict = ckpt.get("model_state_dict", ckpt)
                try:
                    self.model.load_state_dict(state_dict)
                except Exception:
                    self.model.load_state_dict(state_dict, strict=False)
                self.model.to(self.device).eval()
                self.status = ckpt.get("status", "TRAINED")
                print(f"[UNetLoader] Loaded: {self.weights_path}  status={self.status}")
            except Exception as e:
                print(f"[UNetLoader] WARNING: {e} — status: NOT_TRAINED")
        else:
            print(f"[UNetLoader] Status: NOT_TRAINED — "
                  "train with: python training/train_unet.py")

    def is_ready(self) -> bool:
        return self.status in ("TRAINED", "VALIDATED")

    def predict_mask(self, tensor: torch.Tensor) -> torch.Tensor:
        """
        Run segmentation inference.
        Returns [1, 4, H, W] logits. Argmax gives class mask.
        Only callable when status == TRAINED or VALIDATED.
        """
        if not self.is_ready():
            raise RuntimeError(
                f"U-Net NOT_TRAINED — cannot run segmentation inference. "
                "Train with: python training/train_unet.py"
            )
        self.model.eval()
        with torch.no_grad():
            return self.model(tensor.to(self.device))
