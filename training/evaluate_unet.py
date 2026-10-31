"""
DRISHTI-X — U-Net Lesion Segmentation Evaluation
Computes Dice, IoU, Precision, Recall per lesion class.
Run after training/train_unet.py

Usage:
    python training/evaluate_unet.py
"""
import os, sys, json, glob
from pathlib import Path

import torch
import numpy as np
from torch.utils.data import DataLoader
from PIL import Image
from torchvision import transforms

sys.path.insert(0, str(Path(__file__).parent.parent))
from ai.segmentation.unet import UNet, UNetLoader


UNET_WEIGHTS  = "models/weights/unet_lesion.pth"
TRAIN_IMGS    = "datasets/idrid/A. Segmentation/1. Original Images/a. Training Set"
TRAIN_MASKS   = "datasets/idrid/A. Segmentation/2. All Segmentation Groundtruths/a. Training Set"
CLASS_NAMES   = {0: "background", 1: "microaneurysm", 2: "hemorrhage", 3: "hard_exudate"}
LESION_FOLDERS = {
    1: "1. Microaneurysms",
    2: "2. Haemorrhages",
    3: "3. Hard Exudates",
}


def load_combined_mask(img_name: str, mask_dir: str, size: int = 512) -> np.ndarray:
    mask = np.zeros((size, size), dtype=np.int64)
    prefix = img_name.replace(".jpg", "")
    for cls_idx, folder in LESION_FOLDERS.items():
        folder_path = os.path.join(mask_dir, folder)
        if not os.path.isdir(folder_path):
            continue
        candidates = (glob.glob(os.path.join(folder_path, f"{prefix}*.tif")) +
                      glob.glob(os.path.join(folder_path, f"{prefix}*.png")))
        if not candidates:
            continue
        m = np.array(Image.open(candidates[0]).convert("L").resize(
            (size, size), Image.NEAREST)) > 127
        mask[m] = cls_idx
    return mask


def dice_score(pred: np.ndarray, target: np.ndarray, cls: int,
               smooth: float = 1e-6) -> float:
    p = (pred == cls).astype(float)
    t = (target == cls).astype(float)
    intersection = (p * t).sum()
    return (2 * intersection + smooth) / (p.sum() + t.sum() + smooth)


def iou_score(pred: np.ndarray, target: np.ndarray, cls: int,
              smooth: float = 1e-6) -> float:
    p = (pred == cls).astype(float)
    t = (target == cls).astype(float)
    intersection = (p * t).sum()
    union = p.sum() + t.sum() - intersection
    return (intersection + smooth) / (union + smooth)


def precision_recall(pred: np.ndarray, target: np.ndarray, cls: int):
    p = (pred == cls).astype(float)
    t = (target == cls).astype(float)
    tp = (p * t).sum()
    fp = (p * (1 - t)).sum()
    fn = ((1 - p) * t).sum()
    precision = tp / (tp + fp + 1e-6)
    recall    = tp / (tp + fn + 1e-6)
    return float(precision), float(recall)


def evaluate_unet():
    if not os.path.exists(UNET_WEIGHTS):
        print(f"Weights not found: {UNET_WEIGHTS}")
        print("Train U-Net first: python training/train_unet.py")
        sys.exit(1)

    if not os.path.isdir(TRAIN_IMGS):
        print(f"Dataset not found: {TRAIN_IMGS}")
        sys.exit(1)

    loader = UNetLoader(weights_path=UNET_WEIGHTS)
    if not loader.is_ready():
        print(f"U-Net not ready: {loader.status}")
        sys.exit(1)

    device = loader.device
    loader.model.eval()

    img_paths = sorted(glob.glob(os.path.join(TRAIN_IMGS, "*.jpg")))
    print(f"Evaluating on {len(img_paths)} images...")

    tf = transforms.Compose([
        transforms.Resize((512, 512)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    per_class_dice  = {c: [] for c in range(1, 4)}
    per_class_iou   = {c: [] for c in range(1, 4)}
    per_class_prec  = {c: [] for c in range(1, 4)}
    per_class_rec   = {c: [] for c in range(1, 4)}

    with torch.no_grad():
        for img_path in img_paths:
            img_name = os.path.basename(img_path)
            img = Image.open(img_path).convert("RGB")
            tensor = tf(img).unsqueeze(0).to(device)

            logits = loader.model(tensor)
            pred_mask = logits.argmax(dim=1)[0].cpu().numpy()
            true_mask = load_combined_mask(img_name, TRAIN_MASKS, size=512)

            for cls in range(1, 4):
                per_class_dice[cls].append(dice_score(pred_mask, true_mask, cls))
                per_class_iou[cls].append(iou_score(pred_mask, true_mask, cls))
                p, r = precision_recall(pred_mask, true_mask, cls)
                per_class_prec[cls].append(p)
                per_class_rec[cls].append(r)

    # Aggregate
    print("\n" + "="*60)
    print("U-NET EVALUATION — IDRiD TRAINING SET (SELF-EVALUATION)")
    print("NOTE: These metrics are on the TRAINING data, not held-out.")
    print("="*60)

    results = {}
    for cls in range(1, 4):
        name = CLASS_NAMES[cls]
        d = float(np.mean(per_class_dice[cls]))
        i = float(np.mean(per_class_iou[cls]))
        p = float(np.mean(per_class_prec[cls]))
        r = float(np.mean(per_class_rec[cls]))
        results[name] = {"dice": round(d,4), "iou": round(i,4),
                         "precision": round(p,4), "recall": round(r,4)}
        print(f"  {name:<20} Dice={d:.4f}  IoU={i:.4f}  "
              f"P={p:.4f}  R={r:.4f}")

    mean_dice = float(np.mean([results[n]["dice"] for n in results]))
    mean_iou  = float(np.mean([results[n]["iou"]  for n in results]))
    print(f"\n  Mean Dice (lesion classes): {mean_dice:.4f}")
    print(f"  Mean IoU  (lesion classes): {mean_iou:.4f}")
    print("="*60)
    print("\nWARNING: Self-evaluation on training set. "
          "True validation requires held-out IDRiD test images with masks.")

    report = {
        "weights": UNET_WEIGHTS,
        "eval_dataset": "idrid_segmentation_train",
        "n_images": len(img_paths),
        "eval_note": "SELF-EVALUATION on training data — not held-out test",
        "per_class": results,
        "mean_dice": round(mean_dice, 4),
        "mean_iou":  round(mean_iou, 4),
    }
    os.makedirs("reports", exist_ok=True)
    out = "reports/unet_evaluation.json"
    with open(out, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nSaved: {out}")
    return report


if __name__ == "__main__":
    evaluate_unet()
