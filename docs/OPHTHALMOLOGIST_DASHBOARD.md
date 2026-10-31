# DRISHTI-X — Ophthalmologist Dashboard & Clinical Review Workflow
**Feature 20 Implementation Deliverable**
**Date:** October 31, 2026  
**Status:** FULLY INTEGRATED & OPERATIONAL

---

## 1. Overview

Feature 20 delivers a dedicated clinical decision-support environment tailored specifically for certified ophthalmologists and retinal specialists. It bridges autonomous AI screening with clinical governance, enabling rapid case triage, multimodal explainability inspection, independent diagnostic sign-off, and structured referral routing.

---

## 2. Dashboard Architecture & Triage Metrics

The dashboard is accessible via `/review` and powered by the dedicated backend route `GET /api/ophthalmologist/dashboard`.

### Key Triage Metrics
1. **Total Screenings:** Aggregate screening volume across all connected community clinics and screening camps.
2. **Human Review Required:** Immediate queue count of cases flagged by the Assurance Engine.
3. **Critical Urgency Cases:** High-risk screenings requiring emergency retinal specialist intervention within 24–48 hours (e.g. Proliferative DR, massive hemorrhage clusters, or severe mismatch risks).
4. **Validated Cases:** Cleared negative or early cases meeting all clinical assurance safety benchmarks.
5. **Recaptures Required:** Screenings halted at quality gates awaiting technician recapture.
6. **Completed Reviews:** Historical archive of physician-reviewed screening records.

---

## 3. Priority Review Queue

The review queue displays prioritized patient cards with real-time indicators:
- **Patient Identification:** Full name or anonymized code, age, gender, and clinical identifiers.
- **AI Prediction Summary:** Predicted DR grade (0–4), ICDR label, calibrated confidence percentage, and temperature scaling indicator.
- **Evidence Concordance Pill:** Visual badge denoting `HIGH_AGREEMENT`, `MEDIUM_AGREEMENT`, or `LOW_AGREEMENT`.
- **Mismatch Alerts:** High-visibility banner highlighting active rules (e.g. `MISMATCH_R01` to `MISMATCH_R06`).
- **Referral Urgency Pill:** Color-coded priority tag (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) calculated from patient risk metrics.
- **One-Click Case Navigation:** Instant transition into deep screening inspection workspace (`/screenings/{id}`).

---

## 4. Multimodal Deep Review Workspace

When an ophthalmologist opens a case, they are provided with an integrated clinical inspection suite:
1. **Original Retina Inspection:** Pan, zoom, and full-resolution view of native fundus capture.
2. **Grad-CAM Saliency Workspace:** Attention heatmap showing regions of highest classifier influence (`backbone.features.8.0`).
3. **U-Net Lesion Evidence Map:** Layered, color-coded segmentation masks for Microaneurysms (Green), Haemorrhages (Red), and Hard Exudates (Amber).
4. **Synchronized Multi-Panel View:** Simultaneous 3-panel lockstep navigation with synchronized crosshairs.
5. **Quality & Assurance Breakdown:** Auditable reasons detailing image sharpness, SNR, calibration, and concordance metrics.

---

## 5. Clinical Review Actions & Sign-Off

The ophthalmologist can execute the following actions in the review drawer:
- **Independent Grade Recording:** Confirm the AI grade or record an independent grade override ($0, 1, 2, 3, 4$).
- **Disagreement Reason Cataloging:** If modifying the AI grade, record specific clinical reasons (e.g. "Artifact mistaken for hemorrhage", "Peripheral neovascularization missed by camera FOV", "Subtle microaneurysms near fovea").
- **Heatmap Utility Evaluation:** Rate the explainability heatmap (`HIGHLY_USEFUL`, `MODERATELY_USEFUL`, `MISLEADING`, `NOT_USEFUL`).
- **Request Recapture:** Flag the image as ungradable and issue specific recapture instructions to the field worker.
- **Tertiary Referral Trigger:** Dispatch a structured referral to a specialist eye hospital with pre-filled clinical notes and follow-up timeline.

---

## 6. Feedback Governance & Regulatory Safety

Continuous automated self-retraining in clinical production is disabled to adhere to strict medical device regulatory standards (FDA / CDSCO). 

All clinician overrides, agreement rates, and disagreement reasons are securely archived in the PostgreSQL audit log and can be exported as structured CSV/JSON datasets via `GET /api/screenings/feedback/export` for periodic offline expert review and benchmark auditing.

