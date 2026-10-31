"""
DRISHTI-X — Deterministic Priority Scoring Service
Feature 22 Implementation.

Operational clinical triage scoring.
Synthesizes:
  - AI predicted DR grade (0-4)
  - Calibrated confidence & uncertainty
  - Grade-lesion mismatch alerts (MISMATCH_R01 - R06)
  - Lesion physical density & hemorrhages
  - Image quality parameters
  - Clinical Assurance status

Priority Levels:
  - CRITICAL (Score >= 70)
  - HIGH     (50 <= Score < 70)
  - MEDIUM   (25 <= Score < 50)
  - ROUTINE  (Score < 25)

IMPORTANT:
Priority is strictly an operational triage aid to manage clinician workflow,
not a clinical risk probability or medical diagnosis.
"""
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone


class PriorityScoringService:
    RULE_VERSION = "1.0.0"

    def calculate_priority(
        self,
        predicted_grade: Optional[int],
        confidence: float,
        quality_score: float,
        calibrated_confidence: Optional[float] = None,
        mismatch_summary: Optional[Dict[str, Any]] = None,
        mismatch_detected: Optional[bool] = None,
        lesion_summary: Optional[Dict[str, Any]] = None,
        assurance_decision: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Calculates deterministic priority score (0.0–100.0) and assigns priority level.
        Returns score, level, detailed contributing factors, rule version, and timestamp.
        """
        if mismatch_summary is None and mismatch_detected is not None:
            mismatch_summary = {"mismatch_detected": bool(mismatch_detected), "critical_count": 1 if mismatch_detected else 0}
        effective_conf = calibrated_confidence if calibrated_confidence is not None else confidence
        factors: List[Dict[str, Any]] = []
        raw_score = 0.0

        # -------------------------------------------------------------
        # 1. Base Score from Predicted DR Severity
        # -------------------------------------------------------------
        if predicted_grade == 4:
            points = 50.0
            raw_score += points
            factors.append({
                "factor": "Proliferative DR (Grade 4) predicted",
                "points": points,
                "category": "PATHOLOGY_SEVERITY",
                "detail": "Vision-threatening diabetic retinopathy requires emergency clinical assessment."
            })
        elif predicted_grade == 3:
            points = 40.0
            raw_score += points
            factors.append({
                "factor": "Severe NPDR (Grade 3) predicted",
                "points": points,
                "category": "PATHOLOGY_SEVERITY",
                "detail": "High risk of rapid progression to proliferative disease under ICDR 4-2-1 criteria."
            })
        elif predicted_grade == 2:
            points = 25.0
            raw_score += points
            factors.append({
                "factor": "Moderate NPDR (Grade 2) predicted",
                "points": points,
                "category": "PATHOLOGY_SEVERITY",
                "detail": "Referable retinopathy requiring specialist confirmation and management."
            })
        elif predicted_grade == 1:
            points = 10.0
            raw_score += points
            factors.append({
                "factor": "Mild NPDR (Grade 1) predicted",
                "points": points,
                "category": "PATHOLOGY_SEVERITY",
                "detail": "Early microaneurysms detected; routine monitoring protocol."
            })
        elif predicted_grade == 0:
            factors.append({
                "factor": "No DR (Grade 0) predicted",
                "points": 0.0,
                "category": "PATHOLOGY_SEVERITY",
                "detail": "No microvascular abnormalities detected."
            })
        else:
            points = 15.0
            raw_score += points
            factors.append({
                "factor": "Unclassified / Pending Grade",
                "points": points,
                "category": "UNCERTAINTY",
                "detail": "Classification incomplete; requires baseline human review."
            })

        # -------------------------------------------------------------
        # 2. Model Confidence & Uncertainty
        # -------------------------------------------------------------
        if effective_conf < 0.65:
            points = 15.0
            raw_score += points
            factors.append({
                "factor": f"High classification uncertainty ({effective_conf:.1%} confidence)",
                "points": points,
                "category": "MODEL_UNCERTAINTY",
                "detail": "Prediction confidence is below certainty threshold; expert visual confirmation needed."
            })
        elif effective_conf < 0.75:
            points = 8.0
            raw_score += points
            factors.append({
                "factor": f"Borderline classification confidence ({effective_conf:.1%})",
                "points": points,
                "category": "MODEL_UNCERTAINTY",
                "detail": "Moderate certainty margin requires standard verification."
            })

        # -------------------------------------------------------------
        # 3. Grade-Lesion Mismatch Flags
        # -------------------------------------------------------------
        if mismatch_summary and mismatch_summary.get("mismatch_detected"):
            crit_count = mismatch_summary.get("critical_count", 0)
            warn_count = mismatch_summary.get("warning_count", 0)

            if crit_count > 0:
                points = 25.0
                raw_score += points
                factors.append({
                    "factor": f"{crit_count} Critical Grade-Lesion Mismatch(es) detected",
                    "points": points,
                    "category": "EVIDENCE_DISCREPANCY",
                    "detail": "Severe discrepancy between global neural prediction and local lesion segmentation."
                })
            elif warn_count > 0:
                points = 12.0
                raw_score += points
                factors.append({
                    "factor": f"{warn_count} Warning Grade-Lesion Mismatch(es) detected",
                    "points": points,
                    "category": "EVIDENCE_DISCREPANCY",
                    "detail": "Borderline discrepancy between classification grade and lesion findings."
                })

        # -------------------------------------------------------------
        # 4. Physical Lesion Burden (Hemorrhages & Surface Coverage)
        # -------------------------------------------------------------
        if lesion_summary:
            he_count = lesion_summary.get("hemorrhages", {}).get("count", 0)
            coverage = (
                lesion_summary.get("microaneurysms", {}).get("retinal_coverage_pct", 0.0)
                + lesion_summary.get("hemorrhages", {}).get("retinal_coverage_pct", 0.0)
                + lesion_summary.get("hard_exudates", {}).get("retinal_coverage_pct", 0.0)
            )
            if he_count >= 10 or coverage >= 1.0:
                points = 12.0
                raw_score += points
                factors.append({
                    "factor": f"Heavy physical lesion burden ({he_count} HE, {coverage:.2f}% retinal coverage)",
                    "points": points,
                    "category": "PHYSICAL_LESIONS",
                    "detail": "Multiple intraretinal hemorrhages indicate significant microvascular breakdown."
                })
            elif he_count >= 4:
                points = 6.0
                raw_score += points
                factors.append({
                    "factor": f"Moderate intraretinal hemorrhages ({he_count} HE)",
                    "points": points,
                    "category": "PHYSICAL_LESIONS",
                    "detail": "Presence of multiple blot hemorrhages."
                })

        # -------------------------------------------------------------
        # 5. Optical Image Quality Gate
        # -------------------------------------------------------------
        if quality_score < 35.0:
            # Low quality must trigger RECAPTURE, not be treated as a severe medical diagnosis!
            factors.append({
                "factor": f"Critically low image quality ({quality_score:.1f}/100)",
                "points": 0.0,
                "category": "OPTICAL_QUALITY",
                "detail": "Recapture required; optical degradation must not artificially inflate clinical severity."
            })
        elif quality_score < 55.0:
            points = 5.0
            raw_score += points
            factors.append({
                "factor": f"Borderline image quality ({quality_score:.1f}/100)",
                "points": points,
                "category": "OPTICAL_QUALITY",
                "detail": "Slight optical haze or illumination gradient warrants human landmark verification."
            })

        # -------------------------------------------------------------
        # 6. Clinical Assurance Escalation
        # -------------------------------------------------------------
        if assurance_decision == "HUMAN_REVIEW_REQUIRED":
            points = 8.0
            raw_score += points
            factors.append({
                "factor": "Clinical Assurance mandatory human review protocol",
                "points": points,
                "category": "CLINICAL_GOVERNANCE",
                "detail": "Case assigned to specialist review queue."
            })

        # Clamp priority score between 0.0 and 100.0
        final_score = round(max(0.0, min(100.0, raw_score)), 1)

        # Map to the four required priority levels:
        # CRITICAL, HIGH, MEDIUM, ROUTINE
        if final_score >= 70.0:
            level = "CRITICAL"
        elif final_score >= 50.0:
            level = "HIGH"
        elif final_score >= 25.0:
            level = "MEDIUM"
        else:
            level = "ROUTINE"

        return {
            "priority_level": level,
            "priority_score": final_score,
            "priority_factors": factors,
            "contributing_factors": factors,
            "priority_rule_version": self.RULE_VERSION,
            "rule_version": self.RULE_VERSION,
            "priority_calculated_at": datetime.now(timezone.utc).isoformat(),
            "calculated_at": datetime.now(timezone.utc).isoformat(),
            "disclaimer": "Priority is an operational triage aid, not a medical diagnosis.",
        }


# Singleton instance
_priority_service: Optional[PriorityScoringService] = None

def get_priority_scoring_service() -> PriorityScoringService:
    global _priority_service
    if _priority_service is None:
        _priority_service = PriorityScoringService()
    return _priority_service
