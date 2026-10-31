"""
DRISHTI-X — EfficientNet-B0 Training Script
Trains on verified clean train split (APTOS 2019 + IDRiD clean subset).
Validates on held-out APTOS 2019 val split.
Held-out test split is strictly preserved for independent final evaluation.

Usage:
    python training/train_efficientnet.py
"""
import os, sys, json, time, random, argparse, hashlib
from datetime import datetime, timezone
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
import numpy as np
import yaml
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from ai.classification.model import DrishtiEfficientNet, DR_GRADE_LABELS
from training.dataset import RetinalDataset, compute_class_weights
from training.transforms import get_train_transforms, get_val_transforms
from training.metrics import compute_multiclass_metrics, compute_binary_metrics


def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def load_config(path):
    with open(path) as f:
        return yaml.safe_load(f)


def get_smoothed_class_weights(labels, num_classes=5, power=0.5):
    """
    Square-root smoothed inverse class frequencies.
    Avoids extreme weight disparities while providing vital gradient signals
    for minority referable grades (Grade 1, 3, 4).
    """
    from collections import Counter
    counts = Counter(labels)
    total = len(labels)
    weights = []
    for i in range(num_classes):
        c = counts.get(i, 1)
        weights.append((total / c) ** power)
    w_tensor = torch.tensor(weights, dtype=torch.float32)
    w_tensor = w_tensor / w_tensor.sum() * num_classes
    return w_tensor


def train_epoch(model, loader, optimizer, criterion, device, epoch, log_interval=25):
    model.train()
    total_loss = correct = total = 0
    for i, (images, labels) in enumerate(loader):
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
        preds = outputs.detach().argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)
        if (i + 1) % log_interval == 0 or (i + 1) == len(loader):
            print(f"  Ep{epoch} [{i+1}/{len(loader)}] loss={loss.item():.4f} acc={correct/total:.3f}")
    return total_loss / len(loader), correct / total


def validate_epoch(model, loader, criterion, device):
    model.eval()
    total_loss = 0
    all_preds, all_labels, all_probs = [], [], []
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            total_loss += criterion(outputs, labels).item()
            probs = torch.softmax(outputs, 1)
            all_preds.extend(probs.argmax(1).cpu().tolist())
            all_labels.extend(labels.cpu().tolist())
            all_probs.append(probs.cpu().numpy())
    probs_np = np.concatenate(all_probs)
    mc = compute_multiclass_metrics(all_labels, all_preds)
    bm = compute_binary_metrics(all_labels, all_preds, probs_np)
    return total_loss / len(loader), mc, bm


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="training/configs/train_config.yaml")
    parser.add_argument("--epochs", type=int, default=None)
    args = parser.parse_args()
    cfg  = load_config(args.config)
    set_seed(cfg["reproducibility"]["seed"])

    train_csv = cfg["dataset"].get("train_csv", "datasets/train_split.csv")
    val_csv   = cfg["dataset"].get("val_csv", "datasets/val_split.csv")

    if not os.path.exists(train_csv) or not os.path.exists(val_csv):
        print("Required splits not found. Preparing clean dataset splits...")
        os.system("python3 scripts/prepare_datasets.py")

    train_df = pd.read_csv(train_csv)
    val_df   = pd.read_csv(val_csv)
    print(f"Clean Train Set: {len(train_df)} images | Distribution: {dict(sorted(train_df['label'].value_counts().items()))}")
    print(f"Clean Val Set:   {len(val_df)} images | Distribution: {dict(sorted(val_df['label'].value_counts().items()))}")

    # Device
    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
    print(f"Execution Device: {device}")

    # DataLoaders
    img_size = cfg["model"]["image_size"]
    nw = cfg["dataset"]["num_workers"]

    train_ds = RetinalDataset(
        train_csv,
        image_col=cfg["dataset"]["image_col"],
        label_col=cfg["dataset"]["label_col"],
        transform=get_train_transforms(img_size),
    )
    val_ds = RetinalDataset(
        val_csv,
        image_col=cfg["dataset"]["image_col"],
        label_col=cfg["dataset"]["label_col"],
        transform=get_val_transforms(img_size),
    )

    class_weights = get_smoothed_class_weights(train_ds.get_labels(), num_classes=5, power=0.5).to(device)
    print(f"Smoothed class weights: {[round(w.item(), 3) for w in class_weights]}")

    train_loader = DataLoader(train_ds, batch_size=cfg["training"]["batch_size"],
                              shuffle=True, num_workers=nw)
    val_loader   = DataLoader(val_ds,   batch_size=cfg["training"]["batch_size"],
                              shuffle=False, num_workers=nw)

    # Model
    model = DrishtiEfficientNet(
        num_classes=cfg["model"]["num_classes"],
        pretrained=cfg["model"]["pretrained"],
        dropout=cfg["model"]["dropout"],
    ).to(device)

    criterion = nn.CrossEntropyLoss(weight=class_weights)

    epochs = args.epochs if args.epochs is not None else cfg["training"]["epochs"]
    warmup_epochs = cfg["training"].get("warmup_epochs", 1)

    # Phase 1: Train classification head with backbone frozen for warmup
    print(f"\n[Phase 1] Warmup — Training classification head for {warmup_epochs} epoch(s)...")
    for param in model.backbone.features.parameters():
        param.requires_grad = False
    
    head_optimizer = optim.AdamW(model.backbone.classifier.parameters(), lr=cfg["training"].get("head_lr", 5.0e-4))
    for ep in range(1, warmup_epochs + 1):
        tr_loss, tr_acc = train_epoch(model, train_loader, head_optimizer, criterion, device, ep, cfg["logging"]["log_interval"])
        val_loss, mc, bm = validate_epoch(model, val_loader, criterion, device)
        print(f"Warmup Ep{ep} | TrLoss={tr_loss:.4f} Acc={tr_acc:.3f} | ValLoss={val_loss:.4f} QWK={mc.get('qwk', 0):.3f}")

    # Phase 2: Unfreeze entire network for end-to-end fine-tuning
    print(f"\n[Phase 2] Fine-Tuning entire network for {epochs} epoch(s)...")
    for param in model.parameters():
        param.requires_grad = True

    optimizer = optim.AdamW([
        {"params": model.backbone.features.parameters(), "lr": cfg["training"]["learning_rate"] * 0.2},
        {"params": model.backbone.classifier.parameters(), "lr": cfg["training"]["learning_rate"]},
    ], weight_decay=cfg["training"]["weight_decay"])

    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    save_dir = cfg["checkpointing"]["save_dir"]
    log_dir  = cfg["logging"]["log_dir"]
    os.makedirs(save_dir, exist_ok=True)
    os.makedirs(log_dir,  exist_ok=True)

    best_val_score = -1.0  # Track QWK
    patience = 0
    history  = []

    print("=" * 65)
    for epoch in range(1, epochs + 1):
        t0 = time.time()
        tr_loss, tr_acc = train_epoch(
            model, train_loader, optimizer, criterion, device,
            epoch, cfg["logging"]["log_interval"]
        )
        val_loss, mc, bm = validate_epoch(model, val_loader, criterion, device)
        scheduler.step()
        elapsed = time.time() - t0

        qwk_val = mc.get("qwk", 0.0)
        sens_flag = "✓" if bm["sensitivity"] >= 0.90 else " "
        spec_flag = "✓" if bm["specificity"] >= 0.85 else " "

        print(
            f"Ep{epoch:2d}/{epochs} "
            f"| TrLoss={tr_loss:.4f} Acc={tr_acc:.3f} "
            f"| ValLoss={val_loss:.4f} Acc={mc['accuracy']:.3f} "
            f"| QWK={qwk_val:.4f} F1={mc['weighted_f1']:.3f} "
            f"| Sens={bm['sensitivity']:.3f}{sens_flag} "
            f"Spec={bm['specificity']:.3f}{spec_flag} "
            f"| {elapsed:.0f}s"
        )

        record = dict(
            epoch=epoch, train_loss=round(tr_loss, 4), train_acc=round(tr_acc, 4),
            val_loss=round(val_loss, 4), val_accuracy=mc["accuracy"],
            val_qwk=qwk_val, val_f1=mc["weighted_f1"],
            val_sensitivity=bm["sensitivity"], val_specificity=bm["specificity"],
        )
        history.append(record)

        # Checkpoint selection strictly on validation QWK
        if qwk_val > best_val_score:
            best_val_score = qwk_val
            patience = 0
            weights_path = os.path.join(save_dir, "best_model.pth")
            torch.save(model.state_dict(), weights_path)
            print(f"  ✓ Saved new best checkpoint (Val QWK={best_val_score:.4f}) -> {weights_path}")
        else:
            patience += 1
            if patience >= cfg["training"]["early_stopping_patience"]:
                print(f"Early stopping at epoch {epoch}")
                break

    # Save history
    hist_path = os.path.join(log_dir, "training_history.json")
    with open(hist_path, "w") as f:
        json.dump(history, f, indent=2)

    print("\n" + "=" * 65)
    print("TRAINING FINISHED")
    print(f"  Best Val QWK:         {best_val_score:.4f}")
    print(f"  Saved Checkpoint:     {weights_path}")
    print(f"  History File:         {hist_path}")
    print("=" * 65)


if __name__ == "__main__":
    main()

