# DRISHTI-X — Clinical Assurance Policy & Multi-Factor Architecture
**Feature 17 Implementation Deliverable**
**Date:** October 31, 2026  
**Status:** VALIDATED & DEPLOYED

---

## 1. Clinical Assurance Philosophy

Diabetic retinopathy screening is a high-stakes clinical diagnostic domain. Over-reliance on raw deep learning classification scores creates unacceptable risks of both false positives (causing patient distress and healthcare system overload) and false negatives (leading to preventable visual impairment or blindness).

DRISHTI-X implements a **deterministic, rule-based Clinical Assurance Engine** that synthesizes multiple orthogonal evidence streams before emitting an operational decision.

---

## 2. Multi-Factor Evidence Streams

The Assurance Engine continuously monitors five independent clinical signal layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                      DRISHTI-X Fundus Input                     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
[1. Optical Quality]    [2. Classification]         [3. Lesion Segment.]
• Sharpness (Laplacian) • Raw Softmax Logits        • Pixel-level U-Net
• Illumination Balance  • Calibrated Confidence     • MA / HE / EX Counts
• Signal-to-Noise Ratio • Temperature Scaling       • Retinal Area %
     │                           │                           │
     └───────────────────────────┼───────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
     [4. Evidence Concordance]       [5. Mismatch Detection]
     • ICDR Scale Alignment          • MISMATCH_R01 - R06
     • Biological Agreement          • Severity: Critical/Warning
                 │                               │
                 └───────────────┬───────────────┘
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │   CLINICAL ASSURANCE ENGINE   │
                 │   Deterministic Rule Tree     │
                 └───────────────┬───────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
 [RECAPTURE_REQUIRED]  [HUMAN_REVIEW_REQUIRED]      [VALIDATED]
```

---

## 3. Signal Integration Rules

### Signal 1: Image Quality Assessment Gate
- **Metric:** Overall quality score $Q \in [0, 100]$, focus blur score, illumination uniformity.
- **Rule:** If $Q < 35.0$, all neural network outputs are suppressed $\implies$ Immediate `RECAPTURE_REQUIRED`.
- **Rule:** If $35.0 \le Q < 55.0$, case is marked as borderline $\implies$ Mandatory `HUMAN_REVIEW_REQUIRED`.

### Signal 2: Calibrated Neural Network Confidence
- **Metric:** Temperature-calibrated probability $C_{\text{cal}} \in [0.0, 0.915]$ using learned parameter $T = 1.1638$.
- **Rule:** If $C_{\text{cal}} < 0.65$, algorithmic certainty is insufficient $\implies$ `HUMAN_REVIEW_REQUIRED`.
- **Rule:** If $0.65 \le C_{\text{cal}} < 0.75$, confidence is moderate $\implies$ Flagged for clinical verification.

### Signal 3: U-Net Lesion Physical Burden
- **Metric:** Discrete lesion counts and total surface area percentage across Microaneurysms, Haemorrhages, and Hard Exudates.
- **Rule:** Evaluated alongside classification to eliminate false negatives and false positives.

### Signal 4: Evidence Concordance
- **Metric:** Concordance level (`HIGH_AGREEMENT`, `MEDIUM_AGREEMENT`, `LOW_AGREEMENT`).
- **Rule:** `LOW_AGREEMENT` forces `HUMAN_REVIEW_REQUIRED`.

### Signal 5: Mismatch Detection
- **Metric:** Alert triggers across rules `MISMATCH_R01` to `MISMATCH_R06`.
- **Rule:** Any `CRITICAL` mismatch forces `HUMAN_REVIEW_REQUIRED` and escalates referral priority to `CRITICAL`.

---

## 4. Deterministic Governance

The Assurance Engine is intentionally designed with **zero black-box ambiguity**:
- It contains no uninterpretable heuristics or non-deterministic large language model prompts.
- Every decision is deterministically reproducible from the numerical metrics.
- Every evaluation emits a structured list of auditable rule items with Rule ID, severity, evidence source, explanation, and required clinical action (Feature 19).

