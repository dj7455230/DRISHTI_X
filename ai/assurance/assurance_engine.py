"""
DRISHTI-X — Clinical Assurance Engine
Transparent rule-based layer that compares:
  - DR classification confidence
  - Image quality
  - Lesion evidence
  - Evidence concordance with predicted grade

Outputs exactly one of three states:
  VALIDATED | HUMAN_REVIEW_REQUIRED | RECAPTURE_REQUIRED

This is an engineering safety layer, not regulatory clinical validation.
"""
from typing import Dict, Any, Optional, List, Tuple


# DR severity thresholds for expected lesion levels
EXPECTED_LESION_BURDEN = {
    0: {"ma_max": 0,  "hem_max": 0,   "exudate_max": 0},
    1: {"ma_max": 20, "hem_max": 3,   "exudate_max": 2},
    2: {"ma_max": 50, "hem_max": 15,  "exudate_max": 10},
    3: {"ma_max": 200,"hem_max": 50,  "exudate_max": 20},
    4: {"ma_max": 500,"hem_max": 100, "exudate_max": 50},
}

MIN_CONFIDENCE_VALIDATED = 0.75
MIN_QUALITY_VALIDATED = 50.0
MIN_CONFIDENCE_REVIEW = 0.50


def compute_concordance(
    predicted_grade: int,
    lesion_summary: Optional[Dict],
    confidence: float,
) -> Tuple[float, str, bool, List[str]]:
    """
    Compute concordance between prediction and lesion evidence.

    Returns:
        (concordance_score 0–1, level, mismatch_detected, mismatch_details)
    """
    if lesion_summary is None:
        return 0.5, "UNKNOWN", False, ["Lesion analysis unavailable"]

    ma_count = lesion_summary.get("microaneurysms", {}).get("count", 0)
    hem_count = lesion_summary.get("hemorrhages", {}).get("count", 0)
    exudate_count = lesion_summary.get("hard_exudates", {}).get("count", 0)
    evidence_score = lesion_summary.get("lesion_evidence_score", 0.0)

    expected = EXPECTED_LESION_BURDEN.get(predicted_grade, EXPECTED_LESION_BURDEN[2])
    mismatch_details = []

    # Check for Grade 0 prediction with lesion evidence
    if predicted_grade == 0 and evidence_score > 0.2:
        mismatch_details.append(
            f"Model predicts No DR but lesion evidence score is {evidence_score:.2f}"
        )

    # Check for high-grade prediction with no lesion evidence
    if predicted_grade >= 3 and evidence_score < 0.15:
        mismatch_details.append(
            f"Model predicts Grade {predicted_grade} (Severe/PDR) "
            f"but lesion evidence score is low ({evidence_score:.2f})"
        )

    # Check hemorrhage counts vs expected
    if predicted_grade <= 1 and hem_count > 10:
        mismatch_details.append(
            f"Predicted mild grade but {hem_count} hemorrhage candidates detected"
        )

    mismatch_detected = len(mismatch_details) > 0

    # Compute concordance score
    # Simple heuristic: confidence × (1 - mismatch_penalty)
    mismatch_penalty = min(len(mismatch_details) * 0.2, 0.6)
    concordance_score = round(confidence * (1 - mismatch_penalty), 3)

    if concordance_score >= 0.7:
        level = "HIGH"
    elif concordance_score >= 0.45:
        level = "MODERATE"
    else:
        level = "LOW"

    return concordance_score, level, mismatch_detected, mismatch_details


def compute_referral_priority(
    predicted_grade: Optional[int],
    confidence: float,
    quality_score: float,
    evidence_score: float,
    mismatch_detected: bool,
) -> Tuple[str, float]:
    """
    Compute referral priority and score.

    Returns:
        (priority_label, score_0_to_100)
    """
    if predicted_grade is None:
        return "MEDIUM", 40.0

    # Base score from DR severity
    severity_scores = {0: 0, 1: 15, 2: 50, 3: 75, 4: 90}
    base = severity_scores.get(predicted_grade, 40)

    # Adjust for confidence
    conf_modifier = (confidence - 0.5) * 20  # -10 to +10

    # Adjust for evidence
    evidence_modifier = evidence_score * 15  # 0 to 15

    # Penalty for mismatch (uncertainty increases referral priority)
    mismatch_modifier = 10 if mismatch_detected else 0

    # Penalty for poor quality
    quality_modifier = max(0, (quality_score - 50) / 50 * 5)  # 0 to 5

    score = base + conf_modifier + evidence_modifier + mismatch_modifier + quality_modifier
    score = float(max(0, min(100, score)))

    if score >= 81:
        priority = "CRITICAL"
    elif score >= 61:
        priority = "HIGH"
    elif score >= 31:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    return priority, round(score, 1)


def run_assurance_engine(
    predicted_grade: Optional[int],
    confidence: float,
    quality_score: float,
    lesion_summary: Optional[Dict],
) -> Dict[str, Any]:
    """
    Main assurance engine. Returns structured assurance result.
    """
    reasons = []

    # ----------------------------------------------------------------
    # RECAPTURE check — quality gates
    # ----------------------------------------------------------------
    if quality_score < 30.0:
        return {
            "assurance_decision": "RECAPTURE_REQUIRED",
            "assurance_reasons": [
                f"Image quality score {quality_score:.0f}/100 is critically low.",
                "Recapture required before analysis.",
            ],
            "concordance_score": None,
            "concordance_level": "NOT_AVAILABLE",
            "mismatch_detected": False,
            "mismatch_details": [],
            "referral_priority": "LOW",
            "referral_score": 0.0,
        }

    # ----------------------------------------------------------------
    # Compute concordance
    # ----------------------------------------------------------------
    concordance_score, concordance_level, mismatch_detected, mismatch_details = \
        compute_concordance(predicted_grade, lesion_summary, confidence)

    evidence_score = (
        lesion_summary.get("lesion_evidence_score", 0.0)
        if lesion_summary else 0.0
    )

    # ----------------------------------------------------------------
    # HUMAN REVIEW checks
    # ----------------------------------------------------------------
    needs_review = False

    if confidence < MIN_CONFIDENCE_REVIEW:
        needs_review = True
        reasons.append(f"Low model confidence ({confidence:.0%})")

    if MIN_CONFIDENCE_REVIEW <= confidence < MIN_CONFIDENCE_VALIDATED:
        needs_review = True
        reasons.append(f"Moderate model confidence ({confidence:.0%}) — borderline")

    if mismatch_detected:
        needs_review = True
        reasons.append("Grade–lesion mismatch detected")
        reasons.extend(mismatch_details)

    if concordance_level == "LOW":
        needs_review = True
        reasons.append(f"Low evidence concordance ({concordance_score:.2f})")

    if quality_score < MIN_QUALITY_VALIDATED:
        needs_review = True
        reasons.append(f"Borderline image quality ({quality_score:.0f}/100)")

    if predicted_grade is None:
        needs_review = True
        reasons.append("Model classification unavailable")

    # ----------------------------------------------------------------
    # ASSURANCE DECISION
    # ----------------------------------------------------------------
    if needs_review:
        decision = "HUMAN_REVIEW_REQUIRED"
    else:
        decision = "VALIDATED"
        reasons.append(
            f"Confidence {confidence:.0%}, quality {quality_score:.0f}/100, "
            f"concordance {concordance_level} — evidence supports prediction."
        )

    # ----------------------------------------------------------------
    # REFERRAL PRIORITY
    # ----------------------------------------------------------------
    referral_priority, referral_score = compute_referral_priority(
        predicted_grade=predicted_grade,
        confidence=confidence,
        quality_score=quality_score,
        evidence_score=evidence_score,
        mismatch_detected=mismatch_detected,
    )

    return {
        "assurance_decision": decision,
        "assurance_reasons": reasons,
        "concordance_score": concordance_score,
        "concordance_level": concordance_level,
        "mismatch_detected": mismatch_detected,
        "mismatch_details": mismatch_details,
        "referral_priority": referral_priority,
        "referral_score": referral_score,
        "is_referable": predicted_grade in {2, 3, 4} if predicted_grade is not None else None,
    }
