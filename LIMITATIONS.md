# DRISHTI-X — Limitations

This document honestly states what has and has not been implemented,
trained, or validated. Nothing here is fabricated.

---

## AI Model

| Item | Status | Notes |
|------|--------|-------|
| EfficientNet-B0 architecture | IMPLEMENTED | Uses timm, ImageNet pretrained weights |
| DR classification training | NOT TRAINED | Requires APTOS 2019 / IDRiD dataset |
| DR classification validation | NOT VALIDATED | No held-out test metrics yet |
| U-Net lesion segmentation | NOT TRAINED | Architecture not yet built |
| Sensitivity > 90% | TARGET NOT YET ACHIEVED | Not trained |
| Specificity > 85% | TARGET NOT YET ACHIEVED | Not trained |
| Grad-CAM | IMPLEMENTED | Real gradient-based, tested against same-answer protection |
| Lesion evidence | CV HEURISTIC | Morphological ops, not U-Net. Labels as "potential candidates" |
| Neovascularization detection | NOT AVAILABLE | Requires trained model |

## Infrastructure

| Item | Status |
|------|--------|
| FastAPI backend | IMPLEMENTED |
| PostgreSQL schema | IMPLEMENTED |
| JWT authentication | IMPLEMENTED |
| Role-based access | IMPLEMENTED |
| Image quality assessment | IMPLEMENTED (real CV metrics) |
| Preprocessing pipeline | IMPLEMENTED (CLAHE, normalization, crop) |
| Assurance engine | IMPLEMENTED |
| Evidence concordance | IMPLEMENTED |
| Referral priority scoring | IMPLEMENTED |
| Audit trail | IMPLEMENTED |
| Offline queue | SCHEMA READY — offline sync logic not yet implemented |
| Report PDF generation | NOT YET IMPLEMENTED |
| Low-bandwidth mode | FRONTEND INDICATOR ONLY — compression not yet implemented |

## MATLAB / Simulink

| Item | Status |
|------|--------|
| MATLAB installed | NOT INSTALLED on this system |
| MATLAB Engine API | NOT AVAILABLE |
| MATLAB .m preprocessing | READY (files written, cannot execute) |
| MATLAB quality assessment | READY (files written, cannot execute) |
| MATLAB vessel segmentation | READY (files written, cannot execute) |
| Simulink model (.slx) | NOT BUILT (Simulink not installed) |
| Telemedicine simulation | PYTHON ANALYTICAL FALLBACK ACTIVE |

## Datasets

| Dataset | Status |
|---------|--------|
| APTOS 2019 | NOT AVAILABLE LOCALLY |
| IDRiD | NOT AVAILABLE LOCALLY |
| Messidor-2 | NOT AVAILABLE LOCALLY |
| DRIVE | NOT AVAILABLE LOCALLY |

## Frontend Pages

| Page | Status |
|------|--------|
| Login / Register | IMPLEMENTED |
| Dashboard | IMPLEMENTED |
| New Screening workflow | IMPLEMENTED |
| Patients list | IMPLEMENTED |
| Screening detail + Doctor Review | IMPLEMENTED |
| Model Lab | IMPLEMENTED |
| Telemedicine simulation | IMPLEMENTED |
| Reports page | NOT YET IMPLEMENTED |
| Audit trail page | NOT YET IMPLEMENTED |
| 3D network visualization | NOT YET IMPLEMENTED |
| Datasets page | NOT YET IMPLEMENTED |

---

## Safety Statement

This prototype does not have regulatory approval (CE, FDA, CDSCO).
It must not be used for real clinical decisions without proper validation,
regulatory clearance, and ophthalmologist oversight.
