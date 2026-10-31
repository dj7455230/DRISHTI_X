# DRISHTI-X — Three-Way Safe Decision Policy & Priority Hierarchy
**Feature 18 Implementation Deliverable**
**Date:** October 31, 2026  
**Status:** VALIDATED & DEPLOYED

---

## 1. Executive Summary

Autonomous diagnostic claims without human oversight are clinically hazardous and ethically impermissible in medical screening. DRISHTI-X enforces a **strict three-way safe decision architecture**:

1. **`RECAPTURE_REQUIRED`** (Priority Level 1 — Highest Precedence)
2. **`HUMAN_REVIEW_REQUIRED`** (Priority Level 2 — Standard Clinical Safety Gate)
3. **`VALIDATED`** (Priority Level 3 — Preliminary Negative / Non-Referable Routine Flow)

---

## 2. Strict Priority Hierarchy

The three decisions are evaluated in strict ordinal precedence:

$$\text{Priority 1 (Recapture)} \succ \text{Priority 2 (Human Review)} \succ \text{Priority 3 (Validated)}$$

If any Priority 1 condition is met, the decision is immediately locked to `RECAPTURE_REQUIRED`. Lower-priority evaluations are halted, and automated grading is blocked to prevent processing garbage optical signals.

If no Priority 1 conditions are triggered, Priority 2 conditions are evaluated. If any Priority 2 condition is met, the decision becomes `HUMAN_REVIEW_REQUIRED`.

Only if **zero** Priority 1 and **zero** Priority 2 conditions are met can a case be designated as `VALIDATED`.

---

## 3. Decision Truth Table & Criteria

| Decision State | Precedence | Trigger Conditions | Clinical Action |
|:---|:---:|:---|:---|
| **`RECAPTURE_REQUIRED`** | **Level 1** (Highest) | • Quality Score $< 35.0$<br>• Quality Score $< 50.0$ AND (Laplacian Blur $< 25.0$ OR Illumination $< 0.25$)<br>• Ungradable FOV or severe optical obscuration | Field health worker/technician is instructed to immediately recapture image with real-time positioning guidance. Analysis pipeline halted. |
| **`HUMAN_REVIEW_REQUIRED`** | **Level 2** (Intermediate) | • Any `CRITICAL` mismatch (`MISMATCH_R01`, `R02`, `R04`, `R05`)<br>• Any `WARNING` mismatch with confidence $< 0.85$<br>• Calibrated Confidence $< 0.65$<br>• Borderline Quality ($35.0 \le Q < 55.0$)<br>• Evidence Concordance is `LOW_AGREEMENT`<br>• Predicted Grade $\ge 2$ (Referable DR mandatory protocol)<br>• Classification model unavailable | Case is routed to the prioritized Ophthalmologist Dashboard (`/review`). Diagnosis is deferred to human specialist. |
| **`VALIDATED`** | **Level 3** (Default Safe) | • Quality Score $\ge 55.0$<br>• Calibrated Confidence $\ge 0.70$<br>• Evidence Concordance is `HIGH_AGREEMENT` or `MEDIUM_AGREEMENT`<br>• Zero `CRITICAL` mismatches<br>• Predicted Grade is 0 (No DR) or 1 (Mild NPDR) with consistent findings | Preliminary automated screening is cleared as non-urgent. Routine 12-month follow-up recommended. |

---

## 4. State Transitions in Patient Screening Lifecycle

```
[New Screening Case]
        │
        ▼
[Image Uploaded]
        │
        ▼
[Quality Assessment Gate]
        ├── Quality < 35 ─────────────────────────► [RECAPTURE_REQUIRED]
        │                                                    │
        └── Quality >= 35                                    ▼
                │                                     (Retake Photo)
                ▼
[Full AI Pipeline (EfficientNet + U-Net)]
        │
        ▼
[Assurance Engine Evaluation]
        ├── Mismatch OR Low Conf OR Grade >= 2 ───► [HUMAN_REVIEW_REQUIRED]
        │                                                    │
        │                                                    ▼
        │                                        [Ophthalmologist Review]
        │                                        ├── Confirm / Override Grade
        │                                        └── Referral / Recapture
        │
        └── Clean, High Conf, Grade 0/1 ──────────► [VALIDATED]
                                                             │
                                                             ▼
                                                    [Routine Follow-up]
```

---

## 5. Audit Logging & Compliance

Every transition between these three states generates an immutable `AuditLog` entry in PostgreSQL containing:
- Authenticated `user_id`
- Timestamp with timezone
- `old_status` and `new_status`
- Model version and weights hash
- Full JSON breakdown of triggered rule reasons.

