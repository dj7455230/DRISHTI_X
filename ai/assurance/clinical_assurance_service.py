"""
DRISHTI-X — Clinical Assurance Service
Features 17, 18, 19 Implementation.

Deterministic, transparent safety engine.
Integrates:
  1. Fundus Image Quality (sharpness, illumination, SNR)
  2. Classification Confidence (Raw and Temperature-Calibrated)
  3. U-Net Lesion Segmentation (Microaneurysms, Hemorrhages, Hard Exudates)
  4. Evidence Concordance Engine (HIGH_AGREEMENT, MEDIUM_AGREEMENT, LOW_AGREEMENT)
  5. Grade-Lesion Mismatch Detection (MISMATCH_R01 to MISMATCH_R06)

Enforces Strict Decision Priority Hierarchy:
  Priority 1: RECAPTURE_REQUIRED
  Priority 2: HUMAN_REVIEW_REQUIRED
  Priority 3: VALIDATED

Provides human-readable, auditable reasons for every decision with rule IDs and recommended actions.
"""
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from ai.assurance.evidence_concordance_service import EvidenceConcordanceService
from ai.assurance.mismatch_detection_service import MismatchDetectionService
from ai.assurance.priority_scoring_service import PriorityScoringService


class ClinicalAssuranceService:
    """
    Evaluates end-to-end clinical assurance for retinal screening.
    """

    def __init__(self):
        self.concordance_service = EvidenceConcordanceService()
        self.mismatch_service = MismatchDetectionService()
        self.priority_service = PriorityScoringService()

    def evaluate(
        self,
        predicted_grade: Optional[int],
        confidence: float,
        quality_score: float,
        quality_details: Optional[Dict[str, Any]] = None,
        calibrated_confidence: Optional[float] = None,
        lesion_summary: Optional[Dict[str, Any]] = None,
        gradcam_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Runs comprehensive clinical assurance assessment.
        """
        effective_conf = calibrated_confidence if calibrated_confidence is not None else confidence
        quality_det = quality_details or {}

        # 1. Run Concordance Analysis
        concordance = self.concordance_service.evaluate(
            predicted_grade=predicted_grade,
            confidence=confidence,
            lesion_summary=lesion_summary,
            calibrated_confidence=calibrated_confidence,
        )

        # 2. Run Mismatch Detection
        mismatches = self.mismatch_service.detect_mismatches(
            predicted_grade=predicted_grade,
            confidence=confidence,
            lesion_summary=lesion_summary,
            gradcam_metadata=gradcam_metadata,
        )

        # 3. Compile Auditable Reasons & Evaluate Decision
        reasons: List[Dict[str, Any]] = []
        decision: str = "VALIDATED"

        # -----------------------------------------------------------------
        # PRIORITY 1: RECAPTURE_REQUIRED (Image Quality Blockers)
        # -----------------------------------------------------------------
        is_recapture = False

        if quality_score < 35.0:
            is_recapture = True
            reasons.append({
                "rule_id": "ASSURE_Q01_CRITICAL_QUALITY",
                "category": "QUALITY",
                "severity": "CRITICAL",
                "evidence_source": "Image Quality Assessment Engine",
                "explanation": f"Image quality score ({quality_score:.1f}/100) is below minimal diagnostic threshold (35.0).",
                "action_required": "Recapture retinal fundus image following standard field alignment and pupil dilation protocols.",
            })

        illumination = quality_det.get("illumination", 1.0)
        blur_laplacian = quality_det.get("blur_laplacian", 100.0)

        if quality_score < 50.0 and (blur_laplacian < 25.0 or illumination < 0.25):
            is_recapture = True
            reasons.append({
                "rule_id": "ASSURE_Q02_SEVERE_ARTIFACTS",
                "category": "QUALITY",
                "severity": "CRITICAL",
                "evidence_source": "Image Quality Assessment Engine",
                "explanation": (
                    f"Severe optical degradation detected (sharpness: {blur_laplacian:.1f}, illumination: {illumination:.2f}). "
                    f"Diagnostic reliability cannot be guaranteed."
                ),
                "action_required": "Instruct technician to adjust camera focus and eliminate illumination glare before re-acquiring.",
            })

        if is_recapture:
            str_reasons = [r["explanation"] for r in reasons]
            return {
                "assurance_decision": "RECAPTURE_REQUIRED",
                "assurance_reasons": str_reasons,
                "concordance_score": None,
                "concordance_level": "NOT_AVAILABLE",
                "mismatch_detected": False,
                "mismatch_details": [],
                "referral_priority": "ROUTINE",
                "referral_score": 0.0,
                "priority_level": "ROUTINE",
                "priority_score": 0.0,
                "priority_factors": [{
                    "factor": f"Image quality {quality_score:.1f}/100 below diagnostic threshold",
                    "points": 0.0,
                    "category": "OPTICAL_QUALITY",
                    "detail": "Recapture required; clinical severity scoring suppressed."
                }],
                "priority_rule_version": "1.0.0",
                "priority_calculated_at": datetime.now(timezone.utc).isoformat(),
                "is_referable": False,
                "priority_safety_level": 1,
                "reasons": reasons,
                "summary": "Screening cannot proceed: Image quality is insufficient for clinical assessment. Recapture mandatory.",
                "quality_summary": {
                    "score": round(quality_score, 1),
                    "is_acceptable": False,
                },
                "confidence_summary": {
                    "raw_confidence": round(confidence, 4),
                    "calibrated_confidence": round(effective_conf, 4),
                },
                "concordance": concordance,
                "mismatches": mismatches,
                "referral_recommendation": {
                    "priority": "LOW",
                    "action": "Immediate image recapture required before clinical grading.",
                },
            }

        # -----------------------------------------------------------------
        # PRIORITY 2: HUMAN_REVIEW_REQUIRED
        # -----------------------------------------------------------------
        needs_human_review = False

        # A. Check Critical / Warning Mismatches
        if mismatches["critical_count"] > 0:
            needs_human_review = True
            for alert in mismatches["alerts"]:
                if alert["severity"] == "CRITICAL":
                    reasons.append({
                        "rule_id": f"ASSURE_M01_{alert['rule_id']}",
                        "category": "MISMATCH",
                        "severity": "CRITICAL",
                        "evidence_source": "Grade-Lesion Mismatch Detection Engine",
                        "explanation": f"Critical mismatch: {alert['description']}",
                        "action_required": alert["recommended_action"],
                    })

        if mismatches["warning_count"] > 0 and effective_conf < 0.85:
            needs_human_review = True
            for alert in mismatches["alerts"]:
                if alert["severity"] == "WARNING":
                    reasons.append({
                        "rule_id": f"ASSURE_M02_{alert['rule_id']}",
                        "category": "MISMATCH",
                        "severity": "WARNING",
                        "evidence_source": "Grade-Lesion Mismatch Detection Engine",
                        "explanation": f"Warning mismatch: {alert['description']}",
                        "action_required": alert["recommended_action"],
                    })

        # B. Check Low Concordance
        if concordance["concordance_category"] == "LOW_AGREEMENT":
            needs_human_review = True
            reasons.append({
                "rule_id": "ASSURE_C01_LOW_CONCORDANCE",
                "category": "CONCORDANCE",
                "severity": "WARNING",
                "evidence_source": "Evidence Concordance Engine",
                "explanation": (
                    f"Low evidence agreement (score: {concordance['concordance_score']:.2f}). "
                    f"Neural network prediction diverges from segmented lesion distribution."
                ),
                "action_required": "Ophthalmologist should inspect the multi-panel explainability workspace.",
            })

        # C. Check Model Confidence
        if effective_conf < 0.65:
            needs_human_review = True
            reasons.append({
                "rule_id": "ASSURE_P01_LOW_CONFIDENCE",
                "category": "CONFIDENCE",
                "severity": "WARNING",
                "evidence_source": "Calibrated EfficientNet-B0 Classifier",
                "explanation": f"Model prediction confidence ({effective_conf:.1%}) is below certainty threshold (65%).",
                "action_required": "Expert visual grading required due to algorithmic uncertainty.",
            })
        elif effective_conf < 0.75:
            reasons.append({
                "rule_id": "ASSURE_P02_MODERATE_CONFIDENCE",
                "category": "CONFIDENCE",
                "severity": "INFO",
                "evidence_source": "Calibrated EfficientNet-B0 Classifier",
                "explanation": f"Model prediction confidence ({effective_conf:.1%}) is moderate (65–75%).",
                "action_required": "Standard clinician verification.",
            })

        # D. Check Quality Borderline
        if quality_score < 55.0:
            needs_human_review = True
            reasons.append({
                "rule_id": "ASSURE_Q03_BORDERLINE_QUALITY",
                "category": "QUALITY",
                "severity": "WARNING",
                "evidence_source": "Image Quality Assessment Engine",
                "explanation": f"Image quality is borderline ({quality_score:.1f}/100), increasing potential for artifact misinterpretation.",
                "action_required": "Verify retinal landmarks manually on high-contrast zoom view.",
            })

        # E. Mandatory Protocol for Referable DR (Grade >= 2)
        if predicted_grade is not None and predicted_grade >= 2:
            needs_human_review = True
            reasons.append({
                "rule_id": "ASSURE_CL01_REFERABLE_PROTOCOL",
                "category": "PROTOCOL",
                "severity": "INFO",
                "evidence_source": "Clinical Screening Safety Protocol",
                "explanation": (
                    f"Predicted Grade {predicted_grade} represents Referable Diabetic Retinopathy. "
                    f"Clinical protocol mandates ophthalmologist sign-off before secondary care referral."
                ),
                "action_required": "Ophthalmologist clinical confirmation and referral scheduling.",
            })

        # -----------------------------------------------------------------
        # PRIORITY 3: VALIDATED
        # -----------------------------------------------------------------
        if needs_human_review:
            decision = "HUMAN_REVIEW_REQUIRED"
            summary = (
                f"Human review required: {len(reasons)} clinical assurance item(s) flagged for ophthalmologist review."
            )
        else:
            decision = "VALIDATED"
            reasons.append({
                "rule_id": "ASSURE_V01_SAFE_CONCORDANCE",
                "category": "ASSURANCE",
                "severity": "INFO",
                "evidence_source": "Clinical Assurance Engine",
                "explanation": (
                    f"High image quality ({quality_score:.1f}/100), high calibrated confidence ({effective_conf:.1%}), "
                    f"and {concordance['concordance_category']} with zero critical mismatches."
                ),
                "action_required": "Automated preliminary screening validated; routine scheduled follow-up recommended.",
            })
            summary = "Screening safely validated: High confidence, clean image quality, and concordant lesion evidence."

        # Compute operational triage priority (Feature 22)
        priority_res = self.priority_service.calculate_priority(
            predicted_grade=predicted_grade,
            confidence=confidence,
            quality_score=quality_score,
            calibrated_confidence=calibrated_confidence,
            mismatch_summary=mismatches,
            lesion_summary=lesion_summary,
            assurance_decision=decision,
        )
        referral_priority = priority_res["priority_level"]
        ref_score = priority_res["priority_score"]

        str_reasons = [r["explanation"] for r in reasons]
        mismatch_details_str = [a["description"] for a in mismatches.get("alerts", [])]

        return {
            "assurance_decision": decision,
            "assurance_reasons": str_reasons,
            "concordance_score": concordance.get("concordance_score"),
            "concordance_level": concordance.get("concordance_category", "MEDIUM_AGREEMENT"),
            "mismatch_detected": mismatches.get("mismatch_detected", False),
            "mismatch_details": mismatch_details_str,
            "referral_priority": referral_priority,
            "referral_score": round(ref_score, 1),
            "priority_level": referral_priority,
            "priority_score": round(ref_score, 1),
            "priority_factors": priority_res["contributing_factors"],
            "priority_rule_version": priority_res["rule_version"],
            "priority_calculated_at": priority_res["calculated_at"],
            "is_referable": predicted_grade in {2, 3, 4} if predicted_grade is not None else False,
            "priority_safety_level": 2 if decision == "HUMAN_REVIEW_REQUIRED" else 3,
            "reasons": reasons,
            "summary": summary,
            "quality_summary": {
                "score": round(quality_score, 1),
                "is_acceptable": True,
            },
            "confidence_summary": {
                "raw_confidence": round(confidence, 4),
                "calibrated_confidence": round(effective_conf, 4),
            },
            "concordance": concordance,
            "mismatches": mismatches,
            "referral_recommendation": {
                "priority": referral_priority,
                "score": round(ref_score, 1),
                "factors": priority_res["contributing_factors"],
                "is_referable": predicted_grade in {2, 3, 4} if predicted_grade is not None else False,
            },
        }
