"""
DRISHTI-X — U-Net Lesion Segmentation Training Script
Trains on IDRiD segmentation masks.

Usage:
    python training/train_unet.py

Requirements:
    datasets/idrid/A. Segmentation/1. Original Images/a. Training Set/
    datasets/idrid/A. Segmentation/2. All Segmentation Groundtruths/

Status: NOT_TRAINED until this script is run successfully.
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
from ai.segmentation.unet import UNet

# IDRiD lesion folders
LESION_FOLDERS = {
    1: "1. Microaneurysms",
    2: "2. Haemorrhages",
    3: "3. Hard Exudates",
}
TRAIN_IMGS  = "datasets/idrid/A. Segmentation/1. Original Images/a. Training Set"
TRAIN_MASKS = "datasets/idrid/A. Segmentation/2. All Segmentation Groundtruths/a. Training Set"


def dice_loss(pred: torch.Tensor, target: torch.Tensor, smooth: float = 1.0) -> torch.Tensor:
    pred   = torch.softmax(pred, dim=1)
    target_oh = torch.zeros_like(pred).scatter_(1, target.unsqueeze(1), 1)
    intersection = (pred * target_oh).sum(dim=(2, 3))
    union = pred.sum(dim=(2, 3)) + target_oh.sum(dim=(2, 3))
    return 1 - ((2 * intersection + smooth) / (union + smooth)).mean()


class IDRiDSegDataset(Dataset):
    def __init__(self, img_dir: str, mask_dir: str, size: int = 512):
        self.img_paths = sorted(glob.glob(os.path.join(img_dir, "*.jpg")))
        self.mask_dir  = mask_dir
        self.size      = size
        self.img_tf = transforms.Compose([
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        if not self.img_paths:
            raise FileNotFoundError(
                f"DATASET NOT AVAILABLE: no images found in {img_dir}\n"
                "Download IDRiD from https://ieee-dataport.org/open-access/indian-diabetic-retinopathy-image-dataset-idrid"
            )
        print(f"IDRiD Segmentation: {len(self.img_paths)} training images found")

    def _load_combined_mask(self, img_name: str) -> np.ndarray:
        """Build a multi-class mask: 0=BG, 1=MA, 2=Haem, 3=Exudate."""
        h, w  = self.size, self.size
        mask  = np.zeros((h, w), dtype=np.int64)
        prefix = img_name.replace(".jpg", "")

        for class_idx, folder in LESION_FOLDERS.items():
            folder_path = os.path.join(self.mask_dir, folder)
            if not os.path.isdir(folder_path):
                continue
            # IDRiD naming: IDRiD_01_MA.tif etc.
            candidates = glob.glob(os.path.join(folder_path, f"{prefix}*.tif")) + \
                         glob.glob(os.path.join(folder_path, f"{prefix}*.png"))
            if not candidates:
                continue
            m = np.array(Image.open(candidates[0]).convert("L").resize(
                    (w, h), Image.NEAREST)) > 127
            mask[m] = class_idx

        return mask

    def __len__(self): return len(self.img_paths)

    def __getitem__(self, idx):
        path     = self.img_paths[idx]
        img_name = os.path.basename(path)
        image    = Image.open(path).convert("RGB")
        image    = self.img_tf(image)
        mask     = self._load_combined_mask(img_name)
        return image, torch.from_numpy(mask).long()


def train_unet():
    if not os.path.isdir(TRAIN_IMGS):
        print(f"DATASET NOT AVAILABLE: {TRAIN_IMGS}")
        print("Download IDRiD segmentation dataset first.")
        sys.exit(1)

    device = (torch.device("cuda") if torch.cuda.is_available()
              else torch.device("mps")
              if hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
              else torch.device("cpu"))
    print(f"Device: {device}")

    dataset = IDRiDSegDataset(TRAIN_IMGS, TRAIN_MASKS, size=512)
    n_val   = max(1, int(len(dataset) * 0.15))
    n_train = len(dataset) - n_val
    train_ds, val_ds = torch.utils.data.random_split(
        dataset, [n_train, n_val],
        generator=torch.Generator().manual_seed(42)
    )
    train_loader = DataLoader(train_ds, batch_size=4, shuffle=True,  num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=4, shuffle=False, num_workers=0)

    model     = UNet(in_channels=3, out_channels=4).to(device)
    print(f"U-Net parameters: {model.parameter_count():,}")
    ce_loss   = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=50)

    best_val_loss = float("inf")
    os.makedirs("models/weights", exist_ok=True)
    os.makedirs("training/logs",  exist_ok=True)
    history = []

    print(f"\nU-Net Training — train={n_train}, val={n_val}")
    print("="*60)

    for epoch in range(1, 51):
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

        # Validation
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for imgs, masks in val_loader:
                imgs, masks = imgs.to(device), masks.to(device)
                preds    = model(imgs)
                val_loss += (ce_loss(preds, masks) + 0.5 * dice_loss(preds, masks)).item()

        tr_loss  /= len(train_loader)
        val_loss /= len(val_loader)
        elapsed   = time.time() - t0
        print(f"Ep{epoch:3d} | TrainLoss={tr_loss:.4f} ValLoss={val_loss:.4f} | {elapsed:.0f}s")
        history.append(dict(epoch=epoch, train_loss=round(tr_loss,4), val_loss=round(val_loss,4)))

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save({
                "model_state_dict": model.state_dict(),
                "epoch": epoch, "val_loss": val_loss,
                "status": "TRAINED",
                "architecture": "unet",
                "num_classes": 4,
                "class_map": {0:"background",1:"microaneurysm",2:"hemorrhage",3:"hard_exudate"},
            }, "models/weights/unet_lesion.pth")
            print(f"  ✓ Saved best U-Net (val_loss={best_val_loss:.4f})")

    with open("training/logs/unet_history.json", "w") as f:
        json.dump(history, f, indent=2)
    print(f"\nU-Net training complete. Best val loss: {best_val_loss:.4f}")
    print("Weights: models/weights/unet_lesion.pth")


if __name__ == "__main__":
    train_unet()
