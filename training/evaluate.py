"""
DRISHTI-X — Model Evaluation Script
Computes held-out test-set metrics after training.

Usage:
    python training/evaluate.py
    python training/evaluate.py --weights models/weights/best_model.pth
"""
import os, sys, json, argparse
from pathlib import Path

import torch, numpy as np
from torch.utils.data import DataLoader

sys.path.insert(0, str(Path(__file__).parent.parent))

from ai.classification.model import DrishtiEfficientNet, DR_GRADE_LABELS
from training.dataset import RetinalDataset
from training.transforms import get_val_transforms
from training.metrics import compute_multiclass_metrics, compute_binary_metrics


def evaluate(weights_path="models/weights/best_model.pth",
             test_csv="datasets/test_split.csv",
             batch_size=16):

    if not os.path.exists(weights_path):
        print(f"WEIGHTS NOT FOUND: {weights_path}")
        print("Train first: python training/train_efficientnet.py")
        sys.exit(1)

    if not os.path.exists(test_csv):
        print(f"TEST SPLIT NOT FOUND: {test_csv}")
        print("Run training first — it creates datasets/test_split.csv")
        sys.exit(1)

    device = (torch.device("cuda") if torch.cuda.is_available()
              else torch.device("mps")
              if hasattr(torch.backends,"mps") and torch.backends.mps.is_available()
              else torch.device("cpu"))

    # Load model via ModelLoader to ensure architecture compatibility
    from ai.classification.model import ModelLoader
    loader_obj = ModelLoader(weights_path=weights_path).load()
    model = loader_obj.model
    device = loader_obj.device
    print(f"Loaded: {weights_path}  (model class={type(model).__name__})")

    # Dataset
    test_ds = RetinalDataset(
        test_csv, image_col="image_path", label_col="label",
        transform=get_val_transforms(224),
    )
    loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False, num_workers=0)
    print(f"Test set: {len(test_ds)} images")

    all_preds, all_labels, all_probs = [], [], []
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            probs  = torch.softmax(model(images), 1)
            all_preds.extend(probs.argmax(1).cpu().tolist())
            all_labels.extend(labels.tolist())
            all_probs.append(probs.cpu().numpy())

    probs_np = np.concatenate(all_probs)
    mc = compute_multiclass_metrics(all_labels, all_preds)
    bm = compute_binary_metrics(all_labels, all_preds, probs_np)

    from sklearn.metrics import cohen_kappa_score
    qwk = cohen_kappa_score(all_labels, all_preds, weights="quadratic")
    mc["quadratic_weighted_kappa"] = round(float(qwk), 4)

    print("\n" + "="*60)
    print("EVALUATION — HELD-OUT TEST SET")
    print("="*60)
    print(f"  Accuracy:    {mc['accuracy']:.4f}")
    print(f"  Macro F1:    {mc['macro_f1']:.4f}")
    print(f"  Weighted F1: {mc['weighted_f1']:.4f}")
    print(f"  QWK:         {qwk:.4f}")
    print(f"  Sensitivity: {bm['sensitivity']:.4f}  {bm['sensitivity_note']}")
    print(f"  Specificity: {bm['specificity']:.4f}  {bm['specificity_note']}")
    if bm.get("roc_auc"):
        print(f"  ROC-AUC:     {bm['roc_auc']:.4f}")
    print("\nPer-class:")
    for g in range(5):
        r = mc["per_class_report"].get(f"Grade {g}", {})
        print(f"  Grade {g} ({DR_GRADE_LABELS[g]:<20}): "
              f"P={r.get('precision',0):.3f} R={r.get('recall',0):.3f} F1={r.get('f1-score',0):.3f}")
    print("="*60)

    report = {
        "weights_path": weights_path,
        "test_csv": test_csv,
        "n_samples": len(all_labels),
        "multiclass": mc,
        "binary_referable": bm,
        "per_grade": {
            str(i): {
                "label": DR_GRADE_LABELS[i],
                "true_count": all_labels.count(i),
                "pred_count": all_preds.count(i),
            } for i in range(5)
        },
    }

    os.makedirs("reports", exist_ok=True)
    out = "reports/evaluation_results.json"
    with open(out, "w") as f:
        json.dump(report, f, indent=2, default=lambda x: bool(x) if isinstance(x, (bool,)) else float(x) if hasattr(x,'item') else str(x))
    print(f"\nSaved: {out}")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", default="models/weights/best_model.pth")
    parser.add_argument("--test_csv", default="datasets/test_split.csv")
    parser.add_argument("--batch_size", type=int, default=16)
    args = parser.parse_args()
    evaluate(args.weights, args.test_csv, args.batch_size)
