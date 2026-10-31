# DRISHTI-X — FEATURE STATUS MATRIX
**Product:** DRISHTI-X (AI-Assisted Retinal Microvasculature Diagnostics)  
**Version:** 1.0.0 (SIH 2026 Edition)  
**Verification Date:** October 31, 2026  

---

## Complete Feature Matrix

| ID | Feature Name | Core Component(s) | Backend Route(s) | UI Path | Status | Verification Detail |
|:---|:---|:---|:---|:---|:---:|:---|
| **F-01** | **Interactive 3D Anatomical Eye Viewer** | `components/Eye3DViewer.tsx` | N/A (WebGL procedural) | `/eye-explorer`, `/dashboard` | **ACTIVE** | Three.js / R3F / Drei procedural model: Sclera, Cornea, Iris, Pupil, Lens, Retina, Optic Disc, Fovea, Vascular Arcades. 360° orbit, hotspots, presets, and Retinal Inspection Mode. |
| **F-02** | **3D Eye Exploration Laboratory** | `app/(app)/eye-explorer/page.tsx` | N/A | `/eye-explorer` | **ACTIVE** | Standalone full-screen laboratory with structure directory, clinical significance cards, and DR pathology correlations. |
| **F-03** | **Retinal Image Analysis Workspace** | `app/(app)/analysis/page.tsx` | `GET /api/screenings/{id}` | `/analysis` | **ACTIVE** | High-res viewer with zoom (1x–4x), pan, 90° rotation, Before/After curtain slider, side-by-side split, and multi-layer synthesis. |
| **F-04** | **Independent AI Visualization Layers** | `app/(app)/analysis/page.tsx` | `POST /api/screenings/{id}/analyze` | `/analysis` | **ACTIVE** | Independent layer toggles for Fundus Base, CLAHE Contrast Enhancement, Grad-CAM attention heatmap (0–100% opacity slider), and Lesion Masks. |
| **F-05** | **Lesion Segmentation Layer (U-Net)** | `components/LesionViewer.tsx` | `ai/segmentation/unet.py` | `/analysis`, `/screenings/[id]` | **ACTIVE** | Candidate identification for Microaneurysms (Green), Retinal Hemorrhages (Red), and Hard Exudates (Cyan/Blue) with pixel area and counts. |
| **F-06** | **Explainable AI (Grad-CAM)** | `components/GradCamViewer.tsx` | `ai/explainability/gradcam.py` | `/analysis`, `/screenings/[id]` | **ACTIVE** | Genuine backpropagated feature attribution from `backbone.features.8.0`; smooth opacity blend, relative activation colormap legend. |
| **F-07** | **Quality Gate Assessment** | `ai/quality/quality_engine.py` | `POST /api/screenings/{id}/quality-check` | `/screenings/new`, `/analysis` | **ACTIVE** | Immediate pre-inference check for focus blur (Laplacian variance), illumination balance, and FOV ratio with actionable recapture advice. |
| **F-08** | **5-Grade DR Classification** | `ai/classification/model.py` | `POST /api/screenings/{id}/analyze` | All Screening Views | **ACTIVE** | PyTorch EfficientNet-B0 with temperature scaling ($T=1.604$); predicts Grades 0–4 with probabilities and Shannon entropy uncertainty. |
| **F-09** | **Diagnostic Command Dashboard** | `app/(app)/dashboard/page.tsx` | `GET /api/dashboard/statistics` | `/dashboard` | **ACTIVE** | Real metrics, embedded 3D Anatomical Eye Hero, model node status, priority referral queue, and rapid action shortcuts. |
| **F-10** | **Clinical Patient Directory** | `app/(app)/patients/page.tsx` | `GET /api/patients`, `POST /api/patients` | `/patients` | **ACTIVE** | Directory search, gender filters, and registration modal with diabetes profile (Type, duration, HbA1c, therapy) and clinical notes. |
| **F-11** | **Patient Clinical Profile & History** | `app/(app)/patients/[id]/page.tsx` | `GET /api/patients/{id}` | `/patients/[id]` | **ACTIVE** | Longitudinal screening history, diabetes management metrics, ocular background, and direct screening links. |
| **F-12** | **End-to-End Screening Intake Wizard** | `app/(app)/screenings/new/page.tsx` | `POST /api/screenings/intake` | `/screenings/new` | **ACTIVE** | 6-step guided intake with image preview, automated quality check, pre-inference review, and real AI execution. |
| **F-13** | **Screening Archive & Filtering** | `app/(app)/screenings/page.tsx` | `GET /api/screenings` | `/screenings` | **ACTIVE** | Filter by clinical status (Human Review, Analyzed, Recapture, Reviewed), search by ID/laterality, direct analyze links. |
| **F-14** | **Automated Clinical PDF Reports** | `backend/app/services/pdf_report_service.py` | `GET /api/screenings/{id}/report/pdf` | `/reports`, `/screenings/[id]` | **ACTIVE** | ReportLab 4.4 compilation with patient metadata, quality scores, DR grade, lesion evidence, Grad-CAM thumbnails, and disclaimers. |
| **F-15** | **Reports Management Archive** | `app/(app)/reports/page.tsx` | `GET /api/reports` | `/reports` | **ACTIVE** | Listing of all generated reports, in-browser summary modal, and direct one-click PDF download. |
| **F-16** | **Model Validation & Generalization** | `app/(app)/model-lab/page.tsx` | `GET /api/evaluation/generalization` | `/model-lab` | **ACTIVE** | Cross-cohort benchmarks on IDRiD, APTOS 2019, and Messidor-2 datasets with QWK, F1, and 5x5 confusion matrices. |
| **F-17** | **Doctor Review & Feedback Loop** | `app/(app)/review/page.tsx` | `POST /api/screenings/{id}/doctor-review` | `/review`, `/screenings/[id]` | **ACTIVE** | Clinician review form, heatmap usefulness ratings, 6 structured disagreement codes, and JSON/CSV audit export. |
| **F-18** | **Specialist Referral Queue** | `app/(app)/referrals/page.tsx` | `GET /api/referrals`, `PATCH /api/referrals/{id}` | `/referrals` | **ACTIVE** | Urgency prioritization (Critical, High, Medium, Low), facility routing, and follow-up tracking. |
| **F-19** | **Rural Offline Screening Mode** | `lib/offlineQueue.ts`, `components/OfflineSyncModal.tsx` | `POST /api/screenings/sync` | Persistent modal | **ACTIVE** | IndexedDB binary persistence for remote village health camps; automatic batch synchronization when reconnected. |
| **F-20** | **Telemedicine Consultation Desk** | `app/(app)/telemedicine/page.tsx` | `GET /api/screenings` | `/telemedicine` | **ACTIVE** | Specialist remote consultation interface with patient-screening pairing. |
| **F-21** | **Audit Trail Logging** | `backend/app/models/audit.py` | `GET /api/audit` | `/audit` | **ACTIVE** | Immutable audit trail tracking logins, patient creations, image uploads, AI analyses, reviews, and report generation. |
| **F-22** | **Dark Medical Theme & Responsive Shell**| `globals.css`, `Sidebar.tsx`, `layout.tsx` | N/A | Global | **ACTIVE** | Consistent `#07111F` midnight palette, `#39D9D0` cyan highlights, layered glassmorphism, and responsive mobile drawer. |

