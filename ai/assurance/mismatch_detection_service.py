"""
DRISHTI-X — Grade-Lesion Mismatch Detection Engine
Feature 16 Implementation.

Non-destructive clinical safeguard.
Evaluates discrepancies between global classification grade, localized U-Net lesion findings,
and Grad-CAM saliency.

Explicit Rule IDs:
  - MISMATCH_R01: High DR Grade (>=2) predicted, but 0 or negligible lesions detected.
  - MISMATCH_R02: Grade 0 (No DR) predicted, but substantial lesions detected.
  - MISMATCH_R03: Grade 1 (Mild NPDR) predicted, but extensive hemorrhages or exudates detected.
  - MISMATCH_R04: Grade 4 (Proliferative DR) predicted, but minimal lesion density.
  - MISMATCH_R05: High lesion density / total area with low predicted grade (0 or 1).
  - MISMATCH_R06: Explainability-Lesion spatial divergence (Grad-CAM peak activation diverges from lesion clusters).
"""
from typing import Dict, Any, Optional, List


class MismatchDetectionService:
    """
    Detects clinical mismatches without modifying model predictions.
    """

    def detect_mismatches(
        self,
        predicted_grade: Optional[int],
        confidence: float,
        lesion_summary: Optional[Dict[str, Any]],
        gradcam_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Executes explicit rule checks (MISMATCH_R01 to MISMATCH_R06).
        Returns a list of structured alert objects.
        """
        alerts: List[Dict[str, Any]] = []

        if predicted_grade is None or lesion_summary is None or lesion_summary.get("status") == "UNAVAILABLE":
            return {
                "mismatch_detected": False,
                "critical_count": 0,
                "warning_count": 0,
                "info_count": 0,
                "alerts": [],
                "summary": "Mismatch detection skipped: classification or segmentation data not available.",
            }

        ma_count = lesion_summary.get("microaneurysms", {}).get("count", 0)
        he_count = lesion_summary.get("hemorrhages", {}).get("count", 0)
        ex_count = lesion_summary.get("hard_exudates", {}).get("count", 0)
        total_lesions = ma_count + he_count + ex_count

        total_coverage_pct = round(
            lesion_summary.get("microaneurysms", {}).get("retinal_coverage_pct", 0.0)
            + lesion_summary.get("hemorrhages", {}).get("retinal_coverage_pct", 0.0)
            + lesion_summary.get("hard_exudates", {}).get("retinal_coverage_pct", 0.0),
            3,
        )

        # -----------------------------------------------------------------
        # MISMATCH_R01: High DR Grade (>=2) but no lesions detected
        # -----------------------------------------------------------------
        if predicted_grade >= 2 and total_lesions == 0:
            alerts.append({
                "rule_id": "MISMATCH_R01",
                "rule_name": "High DR Grade Without Segmented Lesions",
                "severity": "CRITICAL" if predicted_grade >= 3 else "WARNING",
                "category": "FALSE_POSITIVE_RISK",
                "description": (
                    f"Model classified retina as Grade {predicted_grade} ({'Severe/PDR' if predicted_grade >= 3 else 'Moderate NPDR'}), "
                    f"yet U-Net segmentation found 0 microaneurysms, hemorrhages, or exudates."
                ),
                "clinical_implication": (
                    "Potential false positive driven by optical artifacts, pigmentary variation, or model hallucination."
                ),
                "recommended_action": "Ophthalmologist must review fundus image to verify microvasculature status.",
                "non_destructive_notice": "Grade is preserved; human expert verification requested.",
            })

        # -----------------------------------------------------------------
        # MISMATCH_R02: Grade 0 (No DR) but substantial lesions detected
        # -----------------------------------------------------------------
        if predicted_grade == 0 and (he_count >= 2 or ex_count >= 2 or ma_count >= 5):
            alerts.append({
                "rule_id": "MISMATCH_R02",
                "rule_name": "Grade 0 Predicted With Substantial Lesion Evidence",
                "severity": "CRITICAL",
                "category": "FALSE_NEGATIVE_RISK",
                "description": (
                    f"Model predicted Grade 0 (No DR), but segmentation detected {ma_count} microaneurysms, "
                    f"{he_count} hemorrhages, and {ex_count} hard exudates."
                ),
                "clinical_implication": (
                    "Severe risk of under-diagnosis / false negative. Microaneurysms and intraretinal hemorrhages indicate retinopathy."
                ),
                "recommended_action": "Mandatory ophthalmologist review to prevent missed pathology.",
                "non_destructive_notice": "Grade 0 retained in record; flagged as HIGH REVIEW PRIORITY.",
            })

        # -----------------------------------------------------------------
        # MISMATCH_R03: Grade 1 (Mild NPDR) with extensive hemorrhages/exudates
        # -----------------------------------------------------------------
        if predicted_grade == 1 and (he_count >= 5 or ex_count >= 5):
            alerts.append({
                "rule_id": "MISMATCH_R03",
                "rule_name": "Mild NPDR Predicted With Moderate/Severe Lesion Features",
                "severity": "WARNING",
                "category": "UNDER_GRADING_RISK",
                "description": (
                    f"Model predicted Mild NPDR (Grade 1), but segmentation identified {he_count} hemorrhages "
                    f"and {ex_count} hard exudates. Mild NPDR by definition presents microaneurysms only."
                ),
                "clinical_implication": (
                    "Presence of definite hemorrhages or exudates suggests Grade 2 (Moderate NPDR) or higher under ICDR guidelines."
                ),
                "recommended_action": "Evaluate for upgrade to Moderate NPDR and maculopathy evaluation.",
                "non_destructive_notice": "Grade 1 preserved for clinical consideration.",
            })

        # -----------------------------------------------------------------
        # MISMATCH_R04: Grade 4 (PDR) with minimal lesion burden
        # -----------------------------------------------------------------
        if predicted_grade == 4 and total_lesions <= 2:
            alerts.append({
                "rule_id": "MISMATCH_R04",
                "rule_name": "Proliferative DR Predicted With Sparse Lesions",
                "severity": "CRITICAL",
                "category": "DISCREPANCY_ALERT",
                "description": (
                    f"Model predicted Proliferative DR (Grade 4), but only {total_lesions} lesion candidates "
                    f"were segmented across the fundus."
                ),
                "clinical_implication": (
                    "Proliferative DR usually exhibits severe retinopathy signs, vitreous haze, or neovascular vessels."
                ),
                "recommended_action": "Urgent specialist examination required to confirm or rule out active neovascularization.",
                "non_destructive_notice": "High urgency maintained without altering model output.",
            })

        # -----------------------------------------------------------------
        # MISMATCH_R05: High total lesion area (> 2.0%) with low grade (0 or 1)
        # -----------------------------------------------------------------
        if predicted_grade <= 1 and total_coverage_pct >= 2.0:
            alerts.append({
                "rule_id": "MISMATCH_R05",
                "rule_name": "High Lesion Surface Area In Low-Grade Prediction",
                "severity": "CRITICAL",
                "category": "EXTENSIVE_PATHOLOGY_DISCREPANCY",
                "description": (
                    f"Predicted Grade is {predicted_grade}, but segmented lesion coverage is {total_coverage_pct}% of the retina, "
                    f"exceeding normal thresholds for early disease."
                ),
                "clinical_implication": (
                    "High pathological density contradicts low-grade classification."
                ),
                "recommended_action": "Specialist re-evaluation of full posterior pole.",
                "non_destructive_notice": "Flagged for human confirmation.",
            })

        # -----------------------------------------------------------------
        # MISMATCH_R06: Explainability-Lesion Spatial Divergence
        # -----------------------------------------------------------------
        if gradcam_metadata:
            # Check if Grad-CAM metadata indicates focus disparity
            activation_score = gradcam_metadata.get("class_activation_score", 0.0)
            target_class = gradcam_metadata.get("target_class")
            if target_class is not None and target_class >= 2 and total_lesions >= 5 and activation_score < 0.20:
                alerts.append({
                    "rule_id": "MISMATCH_R06",
                    "rule_name": "Explainability–Segmentation Spatial Divergence",
                    "severity": "INFO",
                    "category": "ATTRIBUTION_DISSONANCE",
                    "description": (
                        f"Classifier saliency (Grad-CAM peak score {activation_score:.2f}) shows weak concentration "
                        f"over verified lesion clusters ({total_lesions} segmented lesions)."
                    ),
                    "clinical_implication": (
                        "Classifier may be focusing on peripheral features or image artifacts rather than classical lesions."
                    ),
                    "recommended_action": "Inspect side-by-side synchronized comparison workspace to confirm visual correlation.",
                    "non_destructive_notice": "Informational alert for clinician inspection.",
                })

        critical_count = sum(1 for a in alerts if a["severity"] == "CRITICAL")
        warning_count = sum(1 for a in alerts if a["severity"] == "WARNING")
        info_count = sum(1 for a in alerts if a["severity"] == "INFO")
        mismatch_detected = (critical_count + warning_count) > 0

        summary = (
            f"Detected {len(alerts)} mismatch alerts ({critical_count} Critical, {warning_count} Warning, {info_count} Info)."
            if alerts
            else "No significant grade-lesion mismatches detected. Classification and segmentation are clinically aligned."
        )

        return {
            "mismatch_detected": mismatch_detected,
            "critical_count": critical_count,
            "warning_count": warning_count,
            "info_count": info_count,
            "alerts": alerts,
            "summary": summary,
        }

