"""
DRISHTI-X — Evidence Concordance Engine
Feature 15 Implementation.

Evaluates biological and clinical agreement between:
- EfficientNet-B0 Predicted DR Grade (0 to 4)
- U-Net Retinal Lesion Segmentation Detections (Microaneurysms, Hemorrhages, Hard Exudates)

Concordance Categories:
- HIGH_AGREEMENT: Lesion profile matches ICDR clinical diagnostic criteria for the predicted grade.
- MEDIUM_AGREEMENT: Partial overlap; findings are plausible within borderline grade boundaries.
- LOW_AGREEMENT: Severe discrepancy (e.g. Grade 3 without lesions, or Grade 0 with extensive hemorrhages).
"""
from typing import Dict, Any, Optional, List, Tuple


class EvidenceConcordanceService:
    """
    Evaluates evidence concordance between predicted DR grade and segmented retinal lesions.
    """

    def evaluate(
        self,
        predicted_grade: Optional[int],
        confidence: float,
        lesion_summary: Optional[Dict[str, Any]],
        calibrated_confidence: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Calculates concordance score, category, supporting, conflicting, and missing evidence.
        """
        effective_conf = calibrated_confidence if calibrated_confidence is not None else confidence

        if predicted_grade is None:
            return {
                "concordance_category": "LOW_AGREEMENT",
                "concordance_score": 0.0,
                "confidence_weight": round(effective_conf, 3),
                "supporting_evidence": [],
                "conflicting_evidence": ["Model prediction unavailable."],
                "missing_evidence": ["Predicted DR grade"],
                "rules_triggered": ["RULE_PRED_UNAVAILABLE"],
                "clinical_rationale": "Cannot evaluate evidence concordance without a valid classification prediction.",
            }

        if lesion_summary is None or lesion_summary.get("status") == "UNAVAILABLE":
            return {
                "concordance_category": "MEDIUM_AGREEMENT",
                "concordance_score": round(max(0.4, effective_conf * 0.6), 3),
                "confidence_weight": round(effective_conf, 3),
                "supporting_evidence": [f"DR Grade {predicted_grade} predicted with {effective_conf:.1%} confidence."],
                "conflicting_evidence": [],
                "missing_evidence": ["U-Net lesion segmentation masks"],
                "rules_triggered": ["RULE_SEGMENTATION_UNAVAILABLE"],
                "clinical_rationale": (
                    "Lesion segmentation data is unavailable; concordance is evaluated solely on "
                    "classifier confidence metrics."
                ),
            }

        # Extract lesion counts and metrics
        ma_info = lesion_summary.get("microaneurysms", {})
        he_info = lesion_summary.get("hemorrhages", {})
        ex_info = lesion_summary.get("hard_exudates", {})

        ma_count = ma_info.get("count", 0)
        he_count = he_info.get("count", 0)
        ex_count = ex_info.get("count", 0)
        total_lesions = ma_count + he_count + ex_count

        total_area_px = (
            ma_info.get("total_area_px", 0.0)
            + he_info.get("total_area_px", 0.0)
            + ex_info.get("total_area_px", 0.0)
        )
        total_coverage_pct = round(
            ma_info.get("retinal_coverage_pct", 0.0)
            + he_info.get("retinal_coverage_pct", 0.0)
            + ex_info.get("retinal_coverage_pct", 0.0),
            3,
        )

        supporting: List[str] = []
        conflicting: List[str] = []
        missing: List[str] = []
        rules: List[str] = []

        # Clinical evaluation rules based on ICDR guidelines
        score = 1.0

        if predicted_grade == 0:
            # No DR: Expect 0 or negligible lesions
            if total_lesions == 0:
                supporting.append("Absence of microaneurysms, hemorrhages, and hard exudates aligns with Grade 0 (No DR).")
                rules.append("CONC_G0_CLEAN")
            elif ma_count <= 2 and he_count == 0 and ex_count == 0:
                supporting.append(f"Minor isolated microaneurysm candidate ({ma_count}) is within benign/equivocal tolerance.")
                score -= 0.15
                rules.append("CONC_G0_MINOR_MA")
            else:
                conflicting.append(
                    f"Grade 0 predicted, but detected {ma_count} microaneurysms, {he_count} hemorrhages, "
                    f"and {ex_count} hard exudates."
                )
                score -= min(0.65, 0.20 + (he_count * 0.1) + (ex_count * 0.1))
                rules.append("CONC_G0_LESIONS_DETECTED")

        elif predicted_grade == 1:
            # Mild NPDR: Expect microaneurysms only
            if ma_count >= 1 and he_count == 0 and ex_count == 0:
                supporting.append(f"Detected {ma_count} microaneurysms without hemorrhages or exudates, matching Mild NPDR criteria.")
                rules.append("CONC_G1_MA_ONLY")
            elif ma_count == 0 and he_count == 0 and ex_count == 0:
                missing.append("Expected microaneurysms indicative of Mild NPDR were not segmented.")
                score -= 0.25
                rules.append("CONC_G1_NO_MA")
            elif he_count > 3 or ex_count > 3:
                conflicting.append(
                    f"Mild NPDR predicted, but detected multiple hemorrhages ({he_count}) or exudates ({ex_count}), "
                    f"suggesting Moderate or Severe NPDR."
                )
                score -= min(0.5, 0.15 + (he_count * 0.05) + (ex_count * 0.05))
                rules.append("CONC_G1_EXCESS_LESIONS")
            else:
                supporting.append(f"Lesion distribution ({ma_count} MA, {he_count} HE, {ex_count} EX) is consistent with early retinopathy.")
                score -= 0.1
                rules.append("CONC_G1_MILD_MIXED")

        elif predicted_grade == 2:
            # Moderate NPDR: More than just MAs, scattered HE/EX
            if total_lesions >= 3:
                supporting.append(
                    f"Presence of {ma_count} microaneurysms, {he_count} hemorrhages, and {ex_count} hard exudates "
                    f"supports Moderate NPDR."
                )
                rules.append("CONC_G2_LESIONS_PRESENT")
            elif total_lesions == 0:
                missing.append("Expected microaneurysms and intraretinal hemorrhages were not segmented.")
                conflicting.append("Moderate NPDR predicted, but no retinal lesions were segmented by U-Net.")
                score -= 0.50
                rules.append("CONC_G2_ZERO_LESIONS")
            else:
                supporting.append(f"Low lesion count ({total_lesions}) detected; consistent with early Moderate NPDR.")
                score -= 0.20
                rules.append("CONC_G2_SPARSE_LESIONS")

        elif predicted_grade == 3:
            # Severe NPDR: Extensive hemorrhages, MAs, exudates
            if he_count >= 10 or (he_count >= 5 and ex_count >= 5) or total_coverage_pct >= 0.8:
                supporting.append(
                    f"Extensive lesion burden ({he_count} hemorrhages, {ex_count} hard exudates, {total_coverage_pct}% area) "
                    f"strongly supports Severe NPDR."
                )
                rules.append("CONC_G3_HIGH_BURDEN")
            elif total_lesions < 3:
                conflicting.append(
                    f"Severe NPDR predicted, but only {total_lesions} total lesions detected. "
                    f"ICDR 4-2-1 rule typically requires extensive intraretinal hemorrhages."
                )
                missing.append("Widespread intraretinal hemorrhages (ICDR 4-2-1 criteria)")
                score -= 0.55
                rules.append("CONC_G3_LOW_BURDEN")
            else:
                supporting.append(f"Substantial lesion count ({total_lesions} total) detected, partially supporting Severe NPDR.")
                score -= 0.20
                rules.append("CONC_G3_MODERATE_BURDEN")

        elif predicted_grade == 4:
            # Proliferative DR
            if total_lesions >= 10 or he_count >= 8:
                supporting.append(
                    f"Heavy lesion presence ({he_count} hemorrhages, {total_coverage_pct}% coverage) consistent with severe advanced DR."
                )
                rules.append("CONC_G4_HIGH_BURDEN")
            elif total_lesions == 0:
                conflicting.append("Proliferative DR predicted, but zero lesions detected on fundus segmentation.")
                score -= 0.60
                rules.append("CONC_G4_ZERO_LESIONS")
            else:
                supporting.append(f"Lesion burden ({total_lesions} lesions) detected.")
                score -= 0.25
                rules.append("CONC_G4_INTERMEDIATE")

        # Blend with model confidence: High confidence cushions minor lesion noise, low confidence amplifies discrepancy
        score = max(0.05, min(1.0, score))
        weighted_score = round(score * (0.6 + 0.4 * effective_conf), 3)

        if weighted_score >= 0.70 and len(conflicting) == 0:
            category = "HIGH_AGREEMENT"
            rationale = "Segmented retinal lesions and classification grade exhibit high clinical concordance."
        elif weighted_score >= 0.45 and len(conflicting) <= 1:
            category = "MEDIUM_AGREEMENT"
            rationale = "Clinical evidence is moderately concordant with the predicted grade, with minor borderline discrepancies."
        else:
            category = "LOW_AGREEMENT"
            rationale = (
                "Substantial discrepancy detected between the neural network classification grade "
                "and the segmented lesion profile."
            )

        return {
            "concordance_category": category,
            "concordance_score": weighted_score,
            "confidence_weight": round(effective_conf, 3),
            "lesion_burden": {
                "microaneurysms": ma_count,
                "hemorrhages": he_count,
                "hard_exudates": ex_count,
                "total_lesions": total_lesions,
                "retinal_coverage_pct": total_coverage_pct,
            },
            "supporting_evidence": supporting,
            "conflicting_evidence": conflicting,
            "missing_evidence": missing,
            "rules_triggered": rules,
            "clinical_rationale": rationale,
        }

