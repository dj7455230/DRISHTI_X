"""
DRISHTI-X — Evaluation Metrics
Computes and reports accuracy, precision, recall, F1, ROC-AUC,
sensitivity, specificity, confusion matrix for DR grading.

Target (not guaranteed):
  Sensitivity > 90%
  Specificity > 85%
Never displays targets as achieved unless actually measured.
"""
import numpy as np
import torch
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report,
    precision_recall_curve, auc
)
from typing import List, Dict, Optional


REFERABLE_GRADES = {2, 3, 4}
SENSITIVITY_TARGET = 0.90
SPECIFICITY_TARGET = 0.85


def compute_binary_metrics(
    y_true: List[int],
    y_pred: List[int],
    y_prob: Optional[np.ndarray] = None,
) -> Dict:
    """
    Compute binary referable DR metrics.
    Grade 2–4 = Positive (Referable)
    Grade 0–1 = Negative (Non-Referable)
    """
    y_true_bin = [1 if y in REFERABLE_GRADES else 0 for y in y_true]
    y_pred_bin = [1 if y in REFERABLE_GRADES else 0 for y in y_pred]

    cm = confusion_matrix(y_true_bin, y_pred_bin)
    tn, fp, fn, tp = cm.ravel() if cm.size == 4 else (0, 0, 0, 0)

    sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    f1 = 2 * precision * sensitivity / (precision + sensitivity + 1e-8)

    result = {
        "sensitivity": round(float(sensitivity), 4),
        "specificity": round(float(specificity), 4),
        "precision":   round(float(precision), 4),
        "f1_referable":round(float(f1), 4),
        "tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn),
        "sensitivity_target_met": bool(sensitivity >= SENSITIVITY_TARGET),
        "specificity_target_met": bool(specificity >= SPECIFICITY_TARGET),
        "sensitivity_note": (
            f"TARGET MET ({sensitivity:.1%} >= {SENSITIVITY_TARGET:.0%})"
            if sensitivity >= SENSITIVITY_TARGET
            else f"TARGET NOT YET ACHIEVED ({sensitivity:.1%} < {SENSITIVITY_TARGET:.0%})"
        ),
        "specificity_note": (
            f"TARGET MET ({specificity:.1%} >= {SPECIFICITY_TARGET:.0%})"
            if specificity >= SPECIFICITY_TARGET
            else f"TARGET NOT YET ACHIEVED ({specificity:.1%} < {SPECIFICITY_TARGET:.0%})"
        ),
    }

    if y_prob is not None:
        # Compute AUC using referable probability
        referable_probs = y_prob[:, list(REFERABLE_GRADES)].sum(axis=1)
        try:
            roc_auc = roc_auc_score(y_true_bin, referable_probs)
            result["roc_auc"] = round(roc_auc, 4)
        except Exception:
            result["roc_auc"] = None

    return result


def compute_multiclass_metrics(
    y_true: List[int],
    y_pred: List[int],
    num_classes: int = 5,
) -> Dict:
    """Compute per-class and overall multiclass metrics."""
    acc = accuracy_score(y_true, y_pred)
    report = classification_report(
        y_true, y_pred,
        target_names=[f"Grade {i}" for i in range(num_classes)],
        output_dict=True, zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=list(range(num_classes)))

    from sklearn.metrics import cohen_kappa_score
    qwk = cohen_kappa_score(y_true, y_pred, weights="quadratic")

    return {
        "accuracy": round(acc, 4),
        "per_class_report": report,
        "confusion_matrix": cm.tolist(),
        "macro_f1": round(report.get("macro avg", {}).get("f1-score", 0.0), 4),
        "weighted_f1": round(report.get("weighted avg", {}).get("f1-score", 0.0), 4),
        "qwk": round(float(qwk), 4),
    }
