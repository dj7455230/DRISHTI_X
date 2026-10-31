# DRISHTI-X | Comprehensive Project Audit Report

**Audit Date:** 2026-10-31  
**Auditor:** DRISHTI-X Core Engineering Team  
**System Status:** Pre-Training & Integration Baseline  

---

## 1. Executive Summary

This document provides a thorough audit of the DRISHTI-X repository prior to model training and full-stack integration. DRISHTI-X is an AI-assisted retinal microvasculature diagnostics and diabetic retinopathy (DR) screening platform designed for clinical deployment and national-level hackathon demonstration.

The platform consists of:
- **FastAPI Backend (`backend/` & `ai/`):** High-performance Python backend serving REST endpoints for screening lifecycle, clinical assurance, real-time image quality evaluation, Grad-CAM generation, and automated PDF report compilation.
- **Next.js Frontend (`frontend/`):** Next.js 16 (App Router) + React 19 + TypeScript frontend styled in a premium midnight navy medical theme (`#07111F`) featuring an interactive Three.js/React Three Fiber 3D anatomical eye explorer, multi-layer image analysis workspace, and clinical workflows.
- **Three Datasets (`datasets/`):** APTOS 2019, IDRiD, and Messidor 2.

All components have been verified intact with 0 schema regressions and 123/123 passing PyTest unit/integration tests.

---

## 2. Directory Structure and Repository Organization

```text
aictr/
├── ai/                              # Core AI & computer vision pipelines
│   ├── assurance/                  # Clinical assurance engine & gating logic
│   ├── classification/             # EfficientNet-B0 DR grading architecture & calibration
│   ├── evaluation/                 # Metrics calculation (QWK, ECE, multi-class F1)
│   ├── evidence/                   # Lesion evidence aggregator & heuristic detection
│   ├── explainability/             # Grad-CAM heatmap generator
│   ├── inference/                  # Canonical unified inference service
│   ├── matlab_fallback/            # MATLAB/Octave fallback scripts
│   ├── quality/                    # Retinal image quality assessment engine
│   ├── reliability/                # Uncertainty estimation (MC Dropout, test-time aug)
│   └── segmentation/               # U-Net architecture & lesion segmentation
├── backend/                         # FastAPI application
│   ├── app/
│   │   ├── api/v1/endpoints/       # Screenings, patients, reports, auth, assurance
│   │   ├── core/                   # Security, JWT tokens, application settings
│   │   ├── db/                     # SQLAlchemy models, sessions, base classes
│   │   ├── models/                 # ORM entities (Patient, Screening, Prediction, etc.)
│   │   ├── schemas/                # Pydantic request/response validation schemas
│   │   └── services/               # PDF generation, audit logs, screening service
│   └── tests/                      # Backend tests
├── datasets/                        # Source datasets (Read-only, strictly preserved)
│   ├── aptos2019/                  # 3,662 train + 1,928 test retinal fundus images
│   ├── idrid/                      # Segmentation masks & Disease Grading annotations
│   └── messidor2/                  # 1,744 adjudicated external validation fundus images
├── docs/                            # Architectural documentation & audit reports
├── frontend/                        # Next.js 16 + React 19 TypeScript web platform
│   ├── app/                        # App Router pages ((auth), (app), api)
│   ├── components/                 # UI components, 3D Eye Viewer, Analysis Workspace
│   └── lib/                        # API client, auth context, design tokens
├── models/                          # Model artifacts, configs, and weights
│   ├── configs/                    # Hyperparameter configs (YAML)
│   └── weights/                    # Active PyTorch weights (.pth) & calibration
├── reports/                         # Generated evaluations, clinical reports & JSONs
├── scripts/                         # Preparation, setup, and data migration scripts
├── tests/                           # 123 pytest automated test cases
└── training/                        # Training routines, dataset loaders, loss functions
```

---

## 3. Dataset Discovery & Locations

The three primary datasets are stored locally in `datasets/`:

| Dataset | Relative Path | Size / Count | Purpose in DRISHTI-X |
|---|---|---|---|
| **APTOS 2019** | `datasets/aptos2019/` | 3,662 train PNGs, 1,928 test PNGs | Primary training & validation for 5-grade DR classification |
| **IDRiD** | `datasets/idrid/` | 81 fundus JPGs (54 train, 27 test), full TIFF masks | Retinal lesion segmentation (MA, HE, EX, OD, SE) |
| **Messidor 2** | `datasets/messidor2/archive/messidor-2/messidor-2/preprocess` | 1,744 preprocessed PNGs | Independent external clinical validation set |

### Dataset Protocol Verification
- **APTOS 2019:** Stratified into 70% Train (2,563), 15% Validation (549), and 15% Held-out Test (550). Labels adhere to ICDR 0–4 scale.
- **IDRiD:** Segmentation subset contains 54 training pairs and 27 test pairs at $2848 \times 4288$ resolution. Lesion masks verified for Microaneurysms, Haemorrhages, Hard Exudates, and Optic Disc.
- **Messidor 2:** Adjudicated 1,744 images matching `messidor_data.csv`. 100% of images are confirmed present. Adjudicated DR grades map directly to ICDR 0–4 scale. Messidor 2 is reserved strictly for external validation.

---

## 4. Backend Architecture & API Contracts

### Endpoints Verified
- `GET /api/health` — System status, database health, active AI model provenance.
- `POST /api/auth/login` & `POST /api/auth/register` — JWT authentication with PBKDF2 password hashing.
- `GET /api/patients` & `POST /api/patients` — CRUD operations for patient records.
- `POST /api/screenings/upload` — Multipart fundus image upload with instant validation.
- `POST /api/screenings/{id}/analyze` — Full canonical inference pipeline (Quality -> Preprocess -> EfficientNet-B0 -> Grad-CAM -> U-Net Lesion Segmentation -> Clinical Assurance).
- `GET /api/screenings/{id}/quality-check` — Instant image clarity, illumination, and field-of-view audit.
- `GET /api/screenings/{id}/report/pdf` — Vectorized clinical report compilation with ReportLab.

### Database Schema
Active database is SQLite (`retinatrust.db`), with immediate migration readiness for PostgreSQL.
Key entities:
- `users`: Clinician credentials, roles (Ophthalmologist, Screener, Admin).
- `patients`: Demographics, diabetes history, medical record numbers.
- `screenings`: Screening events, eye side (OD/OS), referral priority, assurance decisions.
- `fundus_images`: Image metadata, resolution, quality flags, storage paths.
- `predictions`: DR grade probabilities, referable status, confidence scores, Grad-CAM paths.
- `reports`: Generated PDF metadata, hashes, doctor sign-offs.

---

## 5. Frontend Architecture & 3D Visualizer

- **Next.js Version:** 16.3.4 (Turbopack + React 19).
- **Interactive 3D Eye (`frontend/components/Eye3DViewer.tsx`):**
  - Procedural anatomically-inspired multi-component eye built with Three.js, React Three Fiber (`@react-three/fiber`), and `@react-three/drei`.
  - Detailed structures: Sclera, Cornea, Iris, Pupil, Crystalline Lens, Vitreous Body, Posterior Retina, Optic Disc, Fovea Centralis, and Retinal Microvasculature.
  - Interactive camera orbits, anatomical hotspots with clinical annotations, and dedicated Retinal Inspection Mode.
- **Retinal Analysis Workspace (`frontend/app/(app)/analysis/page.tsx`):**
  - Multi-layer canvas supporting original fundus, Grad-CAM attention heatmap, U-Net lesion overlays, and interactive curtain slider comparison.
  - Controls: Pan, zoom, rotate, layer opacity, full-screen inspection.
- **Theme & Design Tokens:** Dark medical aesthetic (`#07111F` midnight background, `#39D9D0` primary cyan accent, `#7C8CFF` violet AI accent, glassmorphic cards).

---

## 6. AI & Machine Learning Pipeline Status

### Classification (`ai/classification/`)
- Architecture: `EfficientNet-B0` with dropout (0.3) and linear head (1280 -> 5).
- Pretrained backbone: Torchvision ImageNet weights (`EfficientNet_B0_Weights.IMAGENET1K_V1`).
- Calibration: Post-hoc Temperature Scaling (`ai/classification/calibration.py`).
- Existing checkpoint in `models/weights/best_model.pth` (16.3 MB).

### Segmentation (`ai/segmentation/`)
- Architecture: 4-stage U-Net (`ai/segmentation/unet.py`) with DoubleConv blocks, skip connections, and transpose convolutions.
- Channels: 3 input channels (RGB fundus), 4 output channels (Background, Microaneurysms, Haemorrhages, Hard Exudates).
- Existing checkpoint in `models/weights/unet_lesion.pth` (31.1 MB).

### Explainability (`ai/explainability/`)
- Grad-CAM implemented using PyTorch hooks on `backbone.features[-1]`. Generates normalized heatmaps overlaid on the original image with customizable colormaps.

---

## 7. Audit Findings & Action Items

1. **Dataset Integrity:** All 3 datasets are intact, non-corrupted, and accurately mapped.
2. **Data Leakage Prevention:** Separate manifest files must be saved in `data/splits/` and `data/manifests/` with deterministic seeds.
3. **External Validation Protocol:** Messidor 2 must remain untouched by training scripts to ensure strict zero-leakage clinical validation.
4. **Hardware Utilization:** Apple Silicon M4 MPS device acceleration is available and operational. Benchmarking is required before executing full training epochs.

