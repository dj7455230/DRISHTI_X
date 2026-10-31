"""
DRISHTI-X — Messidor-2 External Evaluation (Phase 25)
Evaluates trained EfficientNet-B0 on Messidor-2 as an EXTERNAL test set.
Results reported SEPARATELY from internal test set.

RULE: Never mix internal (APTOS+IDRiD) metrics with external (Messidor-2) metrics.

Usage:
    python training/evaluate_messidor2.py

Output:
    reports/messidor2_external_evaluation.json
"""
import os, sys, json
from pathlib import Path

import torch
import numpy as np
import pandas as pd
from torch.utils.data import Dataset, DataLoader
from PIL import Image
from torchvision import transforms

sys.path.insert(0, str(Path(__file__).parent.parent))
from ai.classification.model import DrishtiEfficientNet, DR_GRADE_LABELS
from training.metrics import compute_multiclass_metrics, compute_binary_metrics


WEIGHTS_PATH = "models/weights/best_model.pth"
MESSIDOR_CSV = "datasets/messidor2/archive/messidor_data.csv"
MESSIDOR_IMG = "datasets/messidor2/archive/messidor-2/messidor-2/preprocess"


def remap_messidor_grade(grade: int) -> int:
    """
    Messidor-2 uses 0-3 grading. Map to International Clinical Scale 0-4.
    Messidor 0 → 0 (No DR)
    Messidor 1 → 1 (Mild NPDR)
    Messidor 2 → 2 (Moderate NPDR)
    Messidor 3 → 4 (Proliferative DR — conservative mapping)
    Note: This mapping is approximate. Messidor-2 does not distinguish Grade 3 (Severe).
    """
    mapping = {0: 0, 1: 1, 2: 2, 3: 4}
    return mapping.get(grade, grade)


class Messidor2Dataset(Dataset):
    def __init__(self, csv_path: str, img_dir: str, size: int = 224):
        df = pd.read_csv(csv_path)
        # Normalise column names — Messidor-2 CSV has different naming conventions
        # Actual columns: id_code, diagnosis, adjudicated_dme, adjudicated_gradable
        img_col   = "id_code"   if "id_code"   in df.columns else "image_id"
        grade_col = "diagnosis" if "diagnosis" in df.columns else "adjudicated_dr_grade"

        # Filter gradable images if column exists
        if "adjudicated_gradable" in df.columns:
            df = df[df["adjudicated_gradable"] == 1]

        df["image_path"] = df[img_col].apply(lambda x: os.path.join(img_dir, x))
        df["label"]      = df[grade_col].apply(remap_messidor_grade)

        # Only keep images that actually exist on disk
        df = df[df["image_path"].apply(os.path.exists)]
        self.df = df.reset_index(drop=True)
        self.tf = transforms.Compose([
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        print(f"Messidor-2: {len(self.df)} gradable images found on disk")
        if len(self.df) > 0:
            print(f"  Grade distribution: "
                  f"{self.df['label'].value_counts().sort_index().to_dict()}")

    def __len__(self): return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        try:
            img = Image.open(row["image_path"]).convert("RGB")
        except Exception:
            img = Image.fromarray(np.zeros((224, 224, 3), dtype=np.uint8))
        return self.tf(img), int(row["label"])


def evaluate_messidor2():
    if not os.path.exists(WEIGHTS_PATH):
        print(f"Weights not found: {WEIGHTS_PATH}")
        print("Train EfficientNet first: python training/train_efficientnet.py")
        sys.exit(1)

    if not os.path.exists(MESSIDOR_CSV):
        print(f"Messidor-2 CSV not found: {MESSIDOR_CSV}")
        sys.exit(1)

    device = (torch.device("mps")
              if hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
              else torch.device("cpu"))

    # Load model
    model = DrishtiEfficientNet(num_classes=5, pretrained=False)
    ckpt  = torch.load(WEIGHTS_PATH, map_location=device, weights_only=False)
    model.load_state_dict(ckpt.get("model_state_dict", ckpt))
    model.to(device).eval()
    print(f"Loaded: {WEIGHTS_PATH}  (epoch={ckpt.get('epoch','?')})")
    print(f"Training dataset: {ckpt.get('training_dataset','unknown')}")

    # Load Messidor-2
    try:
        ds = Messidor2Dataset(MESSIDOR_CSV, MESSIDOR_IMG)
    except Exception as e:
        print(f"Error loading Messidor-2: {e}")
        sys.exit(1)

    if len(ds) == 0:
        print("ERROR: No Messidor-2 images found at expected path.")
        print(f"Expected images at: {MESSIDOR_IMG}")
        print("Update MESSIDOR_IMG path in this script.")
        sys.exit(1)

    loader = DataLoader(ds, batch_size=16, shuffle=False, num_workers=0)
    all_preds, all_labels, all_probs = [], [], []

    with torch.no_grad():
        for imgs, labels in loader:
            imgs = imgs.to(device)
            probs = torch.softmax(model(imgs), dim=1)
            all_preds.extend(probs.argmax(1).cpu().tolist())
            all_labels.extend(labels.tolist())
            all_probs.append(probs.cpu().numpy())

    all_probs_np = np.concatenate(all_probs)
    mc = compute_multiclass_metrics(all_labels, all_preds)
    bm = compute_binary_metrics(all_labels, all_preds, all_probs_np)

    print("\n" + "="*65)
    print("EXTERNAL EVALUATION — MESSIDOR-2")
    print("Training dataset: APTOS 2019 + IDRiD")
    print(f"External test N:  {len(all_labels)}")
    print("NOTE: Messidor-2 grade 3 mapped to grade 4 (no grade 3 in Messidor).")
    print("="*65)
    print(f"  Accuracy:    {mc['accuracy']:.4f}")
    print(f"  Macro F1:    {mc['macro_f1']:.4f}")
    print(f"  Weighted F1: {mc['weighted_f1']:.4f}")
    print(f"  Sensitivity: {bm['sensitivity']:.4f}  {bm['sensitivity_note']}")
    print(f"  Specificity: {bm['specificity']:.4f}  {bm['specificity_note']}")
    if bm.get("roc_auc"):
        print(f"  ROC-AUC:     {bm['roc_auc']:.4f}")
    print("\nPer-class:")
    for g in range(5):
        r = mc["per_class_report"].get(f"Grade {g}", {})
        count = all_labels.count(g)
        print(f"  Grade {g} ({DR_GRADE_LABELS[g]:<20}): "
              f"N={count:3d}  P={r.get('precision',0):.3f} "
              f"R={r.get('recall',0):.3f} F1={r.get('f1-score',0):.3f}")
    print("="*65)

    report = {
        "evaluation_type": "EXTERNAL",
        "model_weights": WEIGHTS_PATH,
        "model_training_dataset": ckpt.get("training_dataset", "aptos2019+idrid"),
        "external_test_dataset": "Messidor-2",
        "external_test_n": len(all_labels),
        "grade_mapping_note": (
            "Messidor-2 grades 0-3 remapped to International Clinical Scale 0,1,2,4. "
            "Grade 3 (Severe NPDR) is absent from Messidor-2."
        ),
        "multiclass": mc,
        "binary_referable": bm,
        "internal_test_note": (
            "Internal test metrics (APTOS+IDRiD, N=462) are in "
            "reports/evaluation_results.json — DO NOT mix these."
        ),
    }

    os.makedirs("reports", exist_ok=True)
    out = "reports/messidor2_external_evaluation.json"
    with open(out, "w") as f:
        json.dump(report, f, indent=2,
                  default=lambda x: float(x) if hasattr(x, "item") else str(x))
    print(f"\nSaved: {out}")
    return report


if __name__ == "__main__":
    evaluate_messidor2()
