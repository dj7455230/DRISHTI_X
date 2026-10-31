# DRISHTI-X — Evidence Concordance Engine Architecture & Design
**Feature 15 Implementation Deliverable**
**Date:** October 31, 2026  
**Status:** FULLY IMPLEMENTED & TESTED

---

## 1. Executive Summary

The Evidence Concordance Engine evaluates the biological and clinical coherence between two independent deep learning outputs:
1. The global classification prediction from EfficientNet-B0 (DR Grade 0 to 4).
2. The localized lesion segmentation detections from U-Net (counts, surface areas, and spatial distribution of Microaneurysms, Haemorrhages, and Hard Exudates).

Instead of treating the classifier as an unchallengeable black box, the Concordance Engine acts as an automated clinical cross-examiner, flagging whether the actual lesion profile supports or contradicts the assigned DR grade under the International Clinical Diabetic Retinopathy (ICDR) scale.

---

## 2. Concordance Categories

The engine classifies each screening case into one of three distinct concordance tiers:

1. **`HIGH_AGREEMENT` (Score $\ge 0.70$ with zero conflicting evidence):**
   - The detected lesion profile strongly conforms to the expected ICDR pathological criteria for the predicted grade.
   - Example: Grade 2 (Moderate NPDR) with scattered microaneurysms ($N=14$), moderate hemorrhages ($N=6$), and exudates ($N=3$).

2. **`MEDIUM_AGREEMENT` (Score $0.45 \le \text{Score} < 0.70$ with at most one borderline discrepancy):**
   - Findings are clinically plausible but occupy borderline diagnostic boundaries.
   - Example: Grade 1 (Mild NPDR) with an isolated minor hemorrhage candidate that could represent an equivocal microaneurysm.

3. **`LOW_AGREEMENT` (Score $< 0.45$ or substantial contradictory pathology):**
   - Severe clinical discrepancy between the neural classifier and the physical lesion segmentation.
   - Example: Grade 0 (No DR) predicted while U-Net segments extensive blot hemorrhages ($N > 5$), or Grade 3 (Severe NPDR) predicted on a completely pristine fundus with zero lesions.

---

## 3. Mathematical Scoring Model

The concordance score $S_{\text{conc}} \in [0.0, 1.0]$ is computed through baseline ICDR rule evaluation blended with calibrated model confidence:

$$S_{\text{raw}} = 1.0 - \sum_{r \in R_{\text{triggered}}} \Delta_r$$

$$\Delta_r \text{ is the penalty weight associated with clinical violation rule } r.$$

The raw score is clamped to $[0.05, 1.0]$ and modulated by the calibrated classification confidence $C_{\text{cal}}$:

$$S_{\text{conc}} = S_{\text{raw}} \cdot (0.60 + 0.40 \cdot C_{\text{cal}})$$

This formulation ensures that high calibrated confidence can cushion minor segmentation noise, while low confidence magnifies physical discrepancies.

---

## 4. ICDR Rule Evaluation Matrix

| Rule ID | Predicted Grade | Condition | Deduction $\Delta_r$ | Evidence Category | Clinical Meaning |
|:---|:---|:---|:---|:---|:---|
| `CONC_G0_CLEAN` | Grade 0 (No DR) | Total Lesions $= 0$ | $0.00$ | Supporting | Clean retina confirms absence of DR. |
| `CONC_G0_MINOR_MA` | Grade 0 (No DR) | MA $\le 2$, HE $= 0$, EX $= 0$ | $-0.15$ | Supporting | Isolated tiny dot within benign variation. |
| `CONC_G0_LESIONS_DETECTED` | Grade 0 (No DR) | HE $\ge 1$ or EX $\ge 1$ or MA $\ge 3$ | $-0.20 \text{ to } -0.65$ | Conflicting | Undetected DR; high false negative risk. |
| `CONC_G1_MA_ONLY` | Grade 1 (Mild NPDR) | MA $\ge 1$, HE $= 0$, EX $= 0$ | $0.00$ | Supporting | Textbook ICDR Mild NPDR definition. |
| `CONC_G1_NO_MA` | Grade 1 (Mild NPDR) | MA $= 0$, HE $= 0$, EX $= 0$ | $-0.25$ | Missing | Mild DR predicted without visible microaneurysms. |
| `CONC_G1_EXCESS_LESIONS` | Grade 1 (Mild NPDR) | HE $> 3$ or EX $> 3$ | $-0.15 \text{ to } -0.50$ | Conflicting | Multiple hemorrhages suggest Moderate/Severe DR. |
| `CONC_G2_LESIONS_PRESENT` | Grade 2 (Moderate NPDR) | Total Lesions $\ge 3$ | $0.00$ | Supporting | Multi-class lesions support Moderate DR. |
| `CONC_G2_ZERO_LESIONS` | Grade 2 (Moderate NPDR) | Total Lesions $= 0$ | $-0.50$ | Conflicting | Moderate DR claimed without any lesions. |
| `CONC_G3_HIGH_BURDEN` | Grade 3 (Severe NPDR) | HE $\ge 10$ or Coverage $\ge 0.8\%$ | $0.00$ | Supporting | Extensive hemorrhage burden supports 4-2-1 rule. |
| `CONC_G3_LOW_BURDEN` | Grade 3 (Severe NPDR) | Total Lesions $< 3$ | $-0.55$ | Conflicting | Severe DR requires extensive pathology. |
| `CONC_G4_HIGH_BURDEN` | Grade 4 (Proliferative) | Total Lesions $\ge 10$ or HE $\ge 8$ | $0.00$ | Supporting | Advanced microvascular pathology present. |
| `CONC_G4_ZERO_LESIONS` | Grade 4 (Proliferative) | Total Lesions $= 0$ | $-0.60$ | Conflicting | Proliferative DR claimed with 0 lesions. |

---

## 5. API Response Contract

Endpoint: `GET /api/screenings/{id}/concordance`

```json
{
  "screening_id": "97d3910c-512b-47e0-9104-5e16ec334f59",
  "predicted_grade": 2,
  "grade_label": "Moderate NPDR",
  "concordance_category": "HIGH_AGREEMENT",
  "concordance_score": 0.865,
  "confidence_weight": 0.84,
  "lesion_burden": {
    "microaneurysms": 8,
    "hemorrhages": 4,
    "hard_exudates": 3,
    "total_lesions": 15,
    "retinal_coverage_pct": 0.30
  },
  "supporting_evidence": [
    "Presence of 8 microaneurysms, 4 hemorrhages, and 3 hard exudates supports Moderate NPDR."
  ],
  "conflicting_evidence": [],
  "missing_evidence": [],
  "rules_triggered": ["CONC_G2_LESIONS_PRESENT"],
  "clinical_rationale": "Segmented retinal lesions and classification grade exhibit high clinical concordance."
}
```

