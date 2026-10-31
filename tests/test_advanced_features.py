"""
DRISHTI-X — Tests: Advanced Features 11–19
Evidence Concordance, Mismatch Detection, Clinical Assurance, and Lesion Segmentation.
"""
import sys, os
import pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ai.assurance.evidence_concordance_service import EvidenceConcordanceService
from ai.assurance.mismatch_detection_service import MismatchDetectionService
from ai.assurance.clinical_assurance_service import ClinicalAssuranceService
from ai.segmentation.lesion_segmentation_service import LesionSegmentationService
from ai.explainability.gradcam_service import GradCAMService


def test_evidence_concordance_high_agreement():
    service = EvidenceConcordanceService()
    lesion_summary = {
        "microaneurysms": {"count": 15, "total_area_px": 120.0, "retinal_coverage_pct": 0.08},
        "hemorrhages": {"count": 6, "total_area_px": 350.0, "retinal_coverage_pct": 0.22},
        "hard_exudates": {"count": 4, "total_area_px": 210.0, "retinal_coverage_pct": 0.15},
    }
    res = service.evaluate(predicted_grade=2, confidence=0.88, lesion_summary=lesion_summary)
    assert res["concordance_category"] in ("HIGH_AGREEMENT", "MEDIUM_AGREEMENT")
    assert res["concordance_score"] >= 0.50
    assert len(res["supporting_evidence"]) > 0


def test_evidence_concordance_low_agreement():
    service = EvidenceConcordanceService()
    # Grade 3 (Severe) with 0 lesions
    lesion_summary = {
        "microaneurysms": {"count": 0, "total_area_px": 0.0, "retinal_coverage_pct": 0.0},
        "hemorrhages": {"count": 0, "total_area_px": 0.0, "retinal_coverage_pct": 0.0},
        "hard_exudates": {"count": 0, "total_area_px": 0.0, "retinal_coverage_pct": 0.0},
    }
    res = service.evaluate(predicted_grade=3, confidence=0.85, lesion_summary=lesion_summary)
    assert res["concordance_category"] == "LOW_AGREEMENT"
    assert len(res["conflicting_evidence"]) > 0


def test_mismatch_r01_high_grade_zero_lesions():
    service = MismatchDetectionService()
    lesion_summary = {
        "microaneurysms": {"count": 0, "retinal_coverage_pct": 0.0},
        "hemorrhages": {"count": 0, "retinal_coverage_pct": 0.0},
        "hard_exudates": {"count": 0, "retinal_coverage_pct": 0.0},
    }
    res = service.detect_mismatches(predicted_grade=3, confidence=0.9, lesion_summary=lesion_summary)
    assert res["mismatch_detected"] is True
    assert any(a["rule_id"] == "MISMATCH_R01" for a in res["alerts"])


def test_mismatch_r02_grade_zero_substantial_lesions():
    service = MismatchDetectionService()
    lesion_summary = {
        "microaneurysms": {"count": 8, "retinal_coverage_pct": 0.05},
        "hemorrhages": {"count": 3, "retinal_coverage_pct": 0.15},
        "hard_exudates": {"count": 2, "retinal_coverage_pct": 0.10},
    }
    res = service.detect_mismatches(predicted_grade=0, confidence=0.9, lesion_summary=lesion_summary)
    assert res["mismatch_detected"] is True
    assert res["critical_count"] >= 1
    assert any(a["rule_id"] == "MISMATCH_R02" for a in res["alerts"])


def test_mismatch_r03_mild_npdr_extensive_hemorrhages():
    service = MismatchDetectionService()
    lesion_summary = {
        "microaneurysms": {"count": 10, "retinal_coverage_pct": 0.10},
        "hemorrhages": {"count": 8, "retinal_coverage_pct": 0.40},
        "hard_exudates": {"count": 0, "retinal_coverage_pct": 0.0},
    }
    res = service.detect_mismatches(predicted_grade=1, confidence=0.85, lesion_summary=lesion_summary)
    assert res["mismatch_detected"] is True
    assert any(a["rule_id"] == "MISMATCH_R03" for a in res["alerts"])


def test_clinical_assurance_decision_hierarchy():
    service = ClinicalAssuranceService()

    # 1. Quality < 35 triggers RECAPTURE_REQUIRED
    res_recapture = service.evaluate(predicted_grade=2, confidence=0.95, quality_score=28.0)
    assert res_recapture["assurance_decision"] == "RECAPTURE_REQUIRED"
    assert res_recapture["priority_level"] in (1, "ROUTINE") or res_recapture.get("priority_safety_level") == 1

    # 2. Critical Mismatch triggers HUMAN_REVIEW_REQUIRED even with good quality
    res_mismatch = service.evaluate(
        predicted_grade=0,
        confidence=0.90,
        quality_score=85.0,
        lesion_summary={
            "microaneurysms": {"count": 12, "retinal_coverage_pct": 0.1},
            "hemorrhages": {"count": 5, "retinal_coverage_pct": 0.2},
            "hard_exudates": {"count": 2, "retinal_coverage_pct": 0.1},
        }
    )
    assert res_mismatch["assurance_decision"] == "HUMAN_REVIEW_REQUIRED"
    assert res_mismatch["mismatches"]["critical_count"] > 0

    # 3. Clean healthy case gives VALIDATED
    res_validated = service.evaluate(
        predicted_grade=0,
        confidence=0.92,
        quality_score=88.0,
        lesion_summary={
            "microaneurysms": {"count": 0, "retinal_coverage_pct": 0.0},
            "hemorrhages": {"count": 0, "retinal_coverage_pct": 0.0},
            "hard_exudates": {"count": 0, "retinal_coverage_pct": 0.0},
        }
    )
    assert res_validated["assurance_decision"] == "VALIDATED"
    assert len(res_validated["reasons"]) > 0


def test_unet_and_gradcam_services_load():
    unet_svc = LesionSegmentationService()
    assert unet_svc.is_available() is True
    assert unet_svc.loader.status == "TRAINED"

    gradcam_svc = GradCAMService()
    assert gradcam_svc.is_available() is True
    assert gradcam_svc.loader.status == "TRAINED"
