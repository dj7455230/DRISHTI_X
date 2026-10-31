"""
DRISHTI-X — AI Reliability & Trust Engine
Calculates transparent, interpretable reliability indicators:
1. Model prediction uncertainty (Shannon entropy & top-2 margin)
2. Retinal image capture quality factor
3. Lesion evidence concordance factor
4. Overall reliability classification (Never a fabricated percentage)

Reference:
- Shannon, C. E. (1948). A Mathematical Theory of Communication.
- Hendrycks & Gimpel (2017). A Baseline for Detecting Misclassified and Out-of-Distribution Examples.
"""
import math
from typing import Dict, Any, Optional, List, Tuple


def compute_prediction_uncertainty(
    probabilities: Optional[Dict[str, float]],
) -> Dict[str, Any]:
    """
    Compute Shannon entropy and margin of separation from class probabilities.

    Args:
        probabilities: Dict mapping class index (0-4) to float probability

    Returns:
        Dict with entropy, normalized_entropy, top_margin, uncertainty_tier, explanation
    """
    if not probabilities:
        return {
            "entropy": None,
            "normalized_entropy": None,
            "top_margin": None,
            "uncertainty_tier": "ELEVATED",
            "explanation": "Probability distribution is unavailable.",
        }

    probs = [float(probabilities.get(str(i), 0.0)) for i in range(5)]
    total = sum(probs)
    if total <= 0:
        return {
            "entropy": None,
            "normalized_entropy": None,
            "top_margin": None,
            "uncertainty_tier": "ELEVATED",
            "explanation": "Invalid probability distribution (sum is zero).",
        }

    # Normalize if needed
    p_norm = [p / total for p in probs]

    # 1. Shannon Entropy: H = -sum(p * log2(p))
    # For 5 classes, max entropy is log2(5) ~= 2.3219
    max_entropy = math.log2(5.0)
    entropy = -sum(p * math.log2(p + 1e-12) for p in p_norm if p > 0)
    norm_entropy = min(1.0, max(0.0, entropy / max_entropy))

    # 2. Top-2 Margin: p_top1 - p_top2
    sorted_p = sorted(p_norm, reverse=True)
    top_margin = sorted_p[0] - (sorted_p[1] if len(sorted_p) > 1 else 0.0)

    # 3. Categorize Uncertainty Tier
    if norm_entropy < 0.35 and top_margin >= 0.40:
        tier = "LOW"
        explanation = f"Model is decisive with a clear margin ({top_margin:.1%}) and low entropy ({norm_entropy:.2f})."
    elif norm_entropy <= 0.65 and top_margin >= 0.20:
        tier = "MODERATE"
        explanation = f"Model shows moderate confidence with acceptable margin ({top_margin:.1%})."
    else:
        tier = "ELEVATED"
        explanation = f"Elevated classification ambiguity: close secondary class prediction (margin {top_margin:.1%}, entropy {norm_entropy:.2f})."

    return {
        "entropy": round(entropy, 3),
        "normalized_entropy": round(norm_entropy, 3),
        "top_margin": round(top_margin, 3),
        "uncertainty_tier": tier,
        "explanation": explanation,
    }


def evaluate_ai_reliability(
    quality: Dict[str, Any],
    prediction: Optional[Dict[str, Any]],
    lesion_summary: Optional[Dict[str, Any]] = None,
    concordance_level: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Produce an interpretable multi-factor AI Reliability Assessment.
    Does NOT output an ungrounded single percentage score.

    Returns:
        Structured dict with separate indicators:
        - quality_factor
        - uncertainty_factor
        - concordance_factor
        - overall_reliability
        - clinical_action
        - detailed_findings
    """
    is_gradable = quality.get("is_gradable", False)
    quality_score = quality.get("quality_score", 0.0)
    quality_status = quality.get("quality_status", "GRADABLE" if is_gradable else "UNGRADABLE")

    # If image failed quality check, reliability is strictly UNRELIABLE
    if not is_gradable:
        return {
            "reliability_tier": "UNRELIABLE_IMAGE_RECAPTURE",
            "status_label": "Unreliable — Recapture Required",
            "trust_badge_color": "border-red-500/40 bg-red-500/10 text-red-400",
            "quality_factor": {
                "status": quality_status,
                "score": quality_score,
                "assessment": "FAILED — Image quality is insufficient for clinical interpretation.",
            },
            "uncertainty_factor": {
                "tier": "ELEVATED",
                "entropy": None,
                "margin": None,
                "assessment": "Classification suspended due to failed quality gate.",
            },
            "concordance_factor": {
                "level": "NOT_AVAILABLE",
                "mismatch": False,
                "assessment": "Evidence analysis not performed on ungradable capture.",
            },
            "clinical_action": "Recapture retinal fundus image following the guidance before re-attempting screening.",
            "detailed_findings": [
                f"Image quality score ({quality_score:.0f}/100) failed minimum threshold.",
                quality.get("feedback") or "Image unsuitable for reliable assessment.",
            ],
        }

    # Evaluate prediction uncertainty
    probs = prediction.get("probabilities") if prediction else None
    unc = compute_prediction_uncertainty(probs)

    # Evaluate concordance
    concordance = concordance_level or "MODERATE"
    mismatch = False
    if prediction:
        mismatch = prediction.get("mismatch_detected", False)

    detailed_findings = []

    # Quality finding
    if quality_score >= 70:
        q_text = f"Retinal photograph quality is optimal ({quality_score:.0f}/100)."
    elif quality_score >= 50:
        q_text = f"Retinal photograph quality is acceptable ({quality_score:.0f}/100)."
    else:
        q_text = f"Retinal photograph quality is borderline ({quality_score:.0f}/100)."
        detailed_findings.append(q_text)

    # Uncertainty finding
    detailed_findings.append(unc["explanation"])

    # Concordance finding
    if mismatch:
        detailed_findings.append("Disagreement detected between DR grade prediction and visible lesion burden.")
    elif concordance == "HIGH":
        detailed_findings.append("Predicted DR grade is strongly concordant with detected lesion evidence.")

    # Synthesize Overall Reliability Tier
    if unc["uncertainty_tier"] == "LOW" and quality_score >= 60 and not mismatch and concordance in ("HIGH", "MODERATE"):
        tier = "HIGH_RELIABILITY"
        label = "High Clinical Trust"
        badge = "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
        action = "Prediction is well-supported by clear imagery, decisive confidence margin, and concordant lesion evidence."
    elif unc["uncertainty_tier"] == "ELEVATED" or mismatch or quality_score < 45:
        tier = "REQUIRES_CLINICIAN_REVIEW"
        label = "Requires Clinician Review"
        badge = "border-amber-500/40 bg-amber-500/10 text-amber-400"
        action = "Ophthalmologist review required before clinical decision: elevated prediction uncertainty or lesion discordance."
    else:
        tier = "MODERATE_RELIABILITY"
        label = "Moderate Reliability"
        badge = "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
        action = "Screening prediction is acceptable for triage; routine clinician confirmation recommended."

    return {
        "reliability_tier": tier,
        "status_label": label,
        "trust_badge_color": badge,
        "quality_factor": {
            "status": quality_status,
            "score": quality_score,
            "assessment": q_text,
        },
        "uncertainty_factor": {
            "tier": unc["uncertainty_tier"],
            "entropy": unc["entropy"],
            "normalized_entropy": unc["normalized_entropy"],
            "margin": unc["top_margin"],
            "assessment": unc["explanation"],
        },
        "concordance_factor": {
            "level": concordance,
            "mismatch": mismatch,
            "assessment": "Concordant with lesion evidence" if not mismatch else "Lesion-grade mismatch flagged",
        },
        "clinical_action": action,
        "detailed_findings": detailed_findings,
    }

