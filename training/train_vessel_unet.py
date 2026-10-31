"""
DRISHTI-X — DRIVE Vessel Segmentation U-Net Training (Phase 26)
Trains a lightweight U-Net on DRIVE (20 training images + manual vessel masks).

Usage:
    python training/train_vessel_unet.py

Output:
    models/weights/vessel_unet_best.pth
    training/logs/vessel_unet_history.json
"""
import os, sys, json, time, glob
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent))
from ai.segmentation.vessel_segmentation import get_vessel_unet

TRAIN_IMG_DIR  = "datasets/drive/DRIVE/training/images"
TRAIN_MASK_DIR = "datasets/drive/DRIVE/training/1st_manual"
IMG_SIZE       = 512


def dice_loss(pred: torch.Tensor, target: torch.Tensor, smooth=1.0):
    pred   = torch.softmax(pred, dim=1)
    tgt_oh = torch.zeros_like(pred).scatter_(1, target.unsqueeze(1), 1)
    inter  = (pred * tgt_oh).sum(dim=(2,3))
    union  = pred.sum(dim=(2,3)) + tgt_oh.sum(dim=(2,3))
    return 1 - ((2*inter + smooth) / (union + smooth)).mean()


class DRIVEDataset(Dataset):
    def __init__(self, img_dir: str, mask_dir: str, size: int = 512):
        self.img_paths  = sorted(glob.glob(os.path.join(img_dir,  "*.tif")))
        self.mask_paths = sorted(glob.glob(os.path.join(mask_dir, "*.gif")) +
                                 glob.glob(os.path.join(mask_dir, "*.png")) +
                                 glob.glob(os.path.join(mask_dir, "*.tif")))
        assert len(self.img_paths) == len(self.mask_paths), (
            f"Image/mask count mismatch: {len(self.img_paths)} vs {len(self.mask_paths)}"
        )
        self.size = size
        self.img_tf = transforms.Compose([
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225]),
        ])
        print(f"DRIVE: {len(self.img_paths)} images paired with {len(self.mask_paths)} masks")

    def __len__(self): return len(self.img_paths)

    def __getitem__(self, idx):
        img  = Image.open(self.img_paths[idx]).convert("RGB")
        mask = Image.open(self.mask_paths[idx]).convert("L")
        mask = mask.resize((self.size, self.size), Image.NEAREST)
        mask_np = (np.array(mask) > 127).astype(np.int64)
        return self.img_tf(img), torch.from_numpy(mask_np)


def train_vessel_unet():
    if not os.path.isdir(TRAIN_IMG_DIR):
        print(f"DATASET NOT AVAILABLE: {TRAIN_IMG_DIR}")
        sys.exit(1)

    device = (torch.device("mps")
              if hasattr(torch.backends,"mps") and torch.backends.mps.is_available()
              else torch.device("cpu"))
    print(f"Device: {device}")

    dataset = DRIVEDataset(TRAIN_IMG_DIR, TRAIN_MASK_DIR, IMG_SIZE)
    # Split 16 train / 4 val (DRIVE is small — all 20 used)
    n_val   = 4
    n_train = len(dataset) - n_val
    train_ds, val_ds = torch.utils.data.random_split(
        dataset, [n_train, n_val],
        generator=torch.Generator().manual_seed(42)
    )
    train_loader = DataLoader(train_ds, batch_size=2, shuffle=True,  num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=2, shuffle=False, num_workers=0)

    model     = get_vessel_unet().to(device)
    print(f"Vessel U-Net params: {sum(p.numel() for p in model.parameters()):,}")
    ce_loss   = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=5e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=80)

    best_val_loss = float("inf")
    history = []
    os.makedirs("models/weights", exist_ok=True)
    os.makedirs("training/logs",  exist_ok=True)

    print(f"\nVessel U-Net training — train={n_train}, val={n_val}")
    print("="*55)

    for epoch in range(1, 81):
        model.train()
        t0 = time.time()
        tr_loss = 0.0
        for imgs, masks in train_loader:
            imgs, masks = imgs.to(device), masks.to(device)
            optimizer.zero_grad()
            preds  = model(imgs)
            loss   = ce_loss(preds, masks) + 0.5 * dice_loss(preds, masks)
            loss.backward()
            optimizer.step()
            tr_loss += loss.item()
        scheduler.step()

        model.eval()
        val_loss = 0.0
        val_dice_scores = []
        with torch.no_grad():
            for imgs, masks in val_loader:
                imgs, masks = imgs.to(device), masks.to(device)
                preds = model(imgs)
                val_loss += (ce_loss(preds, masks) + 0.5*dice_loss(preds, masks)).item()
                # Compute vessel dice
                pred_mask = preds.argmax(1)
                inter = ((pred_mask==1) & (masks==1)).float().sum()
                union = (pred_mask==1).float().sum() + (masks==1).float().sum()
                val_dice_scores.append((2*inter / (union + 1e-6)).item())

        tr_loss  /= len(train_loader)
        val_loss /= len(val_loader)
        val_dice  = float(np.mean(val_dice_scores))
        elapsed   = time.time() - t0

        if epoch % 10 == 0 or val_loss < best_val_loss:
            print(f"Ep{epoch:3d} | TrainLoss={tr_loss:.4f} ValLoss={val_loss:.4f} "
                  f"ValDice={val_dice:.4f} | {elapsed:.0f}s")

        history.append(dict(epoch=epoch, train_loss=round(tr_loss,4),
                            val_loss=round(val_loss,4), val_dice=round(val_dice,4)))

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save({
                "model_state_dict": model.state_dict(),
                "epoch": epoch,
                "val_loss": val_loss,
                "val_dice": val_dice,
                "status": "TRAINED",
                "architecture": "unet_vessel",
                "num_classes": 2,
                "training_dataset": "DRIVE",
                "class_map": {0: "background", 1: "vessel"},
            }, "models/weights/vessel_unet_best.pth")
            print(f"  ✓ Saved best (val_loss={best_val_loss:.4f} dice={val_dice:.4f})")

    with open("training/logs/vessel_unet_history.json","w") as f:
        json.dump(history, f, indent=2)

    print(f"\nDone. Best val_loss={best_val_loss:.4f}")
    print("Weights: models/weights/vessel_unet_best.pth")


if __name__ == "__main__":
    train_vessel_unet()
