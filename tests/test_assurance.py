"""
DRISHTI-X — Tests: Assurance Engine + Evidence Concordance
"""
import sys, os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ai.assurance.assurance_engine import (
    run_assurance_engine, compute_concordance,
    compute_referral_priority, EXPECTED_LESION_BURDEN
)


def make_lesion_summary(ma=0, hem=0, exudate=0, score=0.0):
    return {
        "microaneurysms": {"count": ma, "total_area_px": 0.0},
        "hemorrhages": {"count": hem, "total_area_px": 0.0},
        "hard_exudates": {"count": exudate, "total_area_px": 0.0},
        "lesion_evidence_score": score,
    }


# ── Assurance Decision ────────────────────────────────────────

def test_recapture_on_very_low_quality():
    r = run_assurance_engine(2, 0.85, quality_score=20.0, lesion_summary=None)
    assert r["assurance_decision"] == "RECAPTURE_REQUIRED"


def test_validated_on_high_confidence_good_quality():
    ls = make_lesion_summary(ma=5, hem=2, exudate=1, score=0.3)
    r = run_assurance_engine(2, 0.92, quality_score=85.0, lesion_summary=ls)
    assert r["assurance_decision"] == "VALIDATED"


def test_human_review_on_low_confidence():
    r = run_assurance_engine(2, 0.35, quality_score=75.0, lesion_summary=None)
    assert r["assurance_decision"] == "HUMAN_REVIEW_REQUIRED"


def test_human_review_on_mismatch():
    # Grade 0 but high evidence score = mismatch
    ls = make_lesion_summary(ma=30, hem=15, exudate=5, score=0.75)
    r = run_assurance_engine(0, 0.80, quality_score=75.0, lesion_summary=ls)
    assert r["assurance_decision"] == "HUMAN_REVIEW_REQUIRED"
    assert r["mismatch_detected"] is True


def test_human_review_on_grade3_no_evidence():
    ls = make_lesion_summary(ma=0, hem=0, exudate=0, score=0.02)
    r = run_assurance_engine(3, 0.88, quality_score=80.0, lesion_summary=ls)
    assert r["assurance_decision"] == "HUMAN_REVIEW_REQUIRED"
    assert r["mismatch_detected"] is True


# ── Referral Priority ─────────────────────────────────────────

def test_no_dr_low_priority():
    priority, score = compute_referral_priority(0, 0.9, 80.0, 0.0, False)
    assert priority == "LOW"
    assert score <= 30


def test_proliferative_dr_critical():
    priority, score = compute_referral_priority(4, 0.95, 85.0, 0.8, False)
    assert priority in ("CRITICAL", "HIGH")
    assert score >= 61


def test_mismatch_increases_priority():
    p1, s1 = compute_referral_priority(2, 0.75, 75.0, 0.3, False)
    p2, s2 = compute_referral_priority(2, 0.75, 75.0, 0.3, True)
    assert s2 > s1


# ── Concordance ───────────────────────────────────────────────

def test_high_concordance_matching_evidence():
    ls = make_lesion_summary(ma=15, hem=8, exudate=3, score=0.55)
    score, level, mismatch, details = compute_concordance(2, ls, confidence=0.88)
    assert level in ("HIGH", "MODERATE")
    assert mismatch is False


def test_low_concordance_grade0_with_lesions():
    ls = make_lesion_summary(ma=40, hem=20, exudate=8, score=0.8)
    score, level, mismatch, details = compute_concordance(0, ls, confidence=0.85)
    assert mismatch is True
    assert len(details) > 0


def test_assurance_result_has_required_keys():
    r = run_assurance_engine(2, 0.75, 80.0, make_lesion_summary(5, 3, 1, 0.3))
    required = [
        "assurance_decision", "assurance_reasons", "concordance_score",
        "concordance_level", "mismatch_detected", "mismatch_details",
        "referral_priority", "referral_score",
    ]
    for k in required:
        assert k in r, f"Missing key: {k}"


def test_referral_score_in_range():
    r = run_assurance_engine(3, 0.80, 75.0, make_lesion_summary(50, 25, 10, 0.7))
    assert 0 <= r["referral_score"] <= 100
