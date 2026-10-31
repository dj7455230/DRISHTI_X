# DRISHTI-X — System Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    DRISHTI-X Platform                       │
│         Explainable AI for DR Screening in Rural India      │
└─────────────────────────────────────────────────────────────┘

Health Worker (PHC)          Ophthalmologist (Remote)
      │                               │
      ▼                               ▼
┌──────────────────────────────────────────────┐
│         Frontend — Next.js 16 + React 19     │
│  Login │ New Screening │ Dashboard           │
│  Doctor Review │ Referral Queue │ Reports    │
│  Model Lab │ Datasets │ Telemedicine         │
│  Audit Trail │ 3D Network Visualization      │
└──────────────────┬───────────────────────────┘
                   │ REST API (JSON)
                   ▼
┌──────────────────────────────────────────────┐
│         Backend — FastAPI + PostgreSQL       │
│  /api/auth      /api/patients                │
│  /api/screenings  /api/screenings/{id}/      │
│    image, analyze, doctor-review, report     │
│  /api/dashboard  /api/models  /api/audit     │
│  /api/simulation                             │
└──────────────────┬───────────────────────────┘
                   │ Python calls
                   ▼
┌──────────────────────────────────────────────────────────────┐
│                   AI Pipeline                                 │
│                                                              │
│  ① Image Quality Assessment (OpenCV)                        │
│     • Laplacian variance (focus)                             │
│     • Histogram analysis (illumination)                      │
│     • Retinal coverage ratio (FOV)                           │
│     → GRADABLE / UNGRADABLE / RECAPTURE_REQUIRED             │
│                                                              │
│  ② Preprocessing                                             │
│     • CLAHE (contrast limited adaptive histogram equalization)│
│     • Illumination normalization (Gaussian background sub)   │
│     • Fundus circle crop                                     │
│     • Resize to 224×224 + ImageNet normalize                 │
│                                                              │
│  ③ DR Classification — EfficientNet-B0                       │
│     • timm pretrained → custom 5-class head                  │
│     • Trained: APTOS 2019 (2563) + IDRiD (516) = 3079 images│
│     • Output: Grade 0–4 + probabilities + confidence         │
│     • Epoch 1 metrics (held-out test, 462 images):           │
│         Sensitivity: 87.7%  (target >90% — NOT YET ACHIEVED)│
│         Specificity: 96.1%  (target >85% — TARGET MET ✓)    │
│         ROC-AUC:     98.2%                                   │
│         Accuracy:    63.9%  (early training — improving)     │
│                                                              │
│  ④ Grad-CAM Explainability                                   │
│     • Real gradient-based heatmap from backbone.conv_head    │
│     • Overlaid on original fundus image                      │
│     • Changes per image — verified by test suite             │
│                                                              │
│  ⑤ Lesion Evidence (CV heuristic, U-Net when trained)        │
│     • Microaneurysm candidates (top-hat morphology)          │
│     • Hemorrhage candidates (adaptive threshold)             │
│     • Exudate candidates (colour threshold)                  │
│     • U-Net architecture ready — training requires IDRiD     │
│       segmentation masks                                     │
│                                                              │
│  ⑥ Evidence Concordance Engine                               │
│     • Compares prediction vs lesion evidence                 │
│     • Detects grade–lesion mismatch                          │
│     • Outputs: concordance score + mismatch flag             │
│                                                              │
│  ⑦ Assurance Engine (rule-based)                             │
│     • Inputs: confidence, quality, concordance, mismatch     │
│     • Output: VALIDATED / HUMAN_REVIEW_REQUIRED /            │
│               RECAPTURE_REQUIRED                             │
│                                                              │
│  ⑧ Referral Priority Scorer                                  │
│     • Score 0–100 → LOW / MEDIUM / HIGH / CRITICAL           │
│                                                              │
└──────────────────┬───────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌──────────────┐   ┌─────────────────────┐
│ MATLAB Bridge│   │ Simulink Simulation │
│ (fallback:   │   │ (fallback: Python   │
│  Python CV)  │   │  analytical model)  │
└──────────────┘   └─────────────────────┘
```

## Database Schema (PostgreSQL)

```
users           — auth, roles (HEALTH_WORKER | OPHTHALMOLOGIST | ADMIN)
patients        — de-identified patient records (patient_code)
screenings      — screening sessions, assurance state, referral
fundus_images   — file paths, quality scores
predictions     — AI grade, confidence, probabilities, Grad-CAM path,
                  model provenance (name, version, weights_hash)
doctor_reviews  — doctor grade stored SEPARATE from AI prediction
reports         — generated report JSON
audit_logs      — immutable action trail
model_versions  — trained model registry with real metrics
```

## Three-Way Assurance Decision

```
Quality < 30%  →  RECAPTURE_REQUIRED
   ↓
Confidence < 50%  OR  Mismatch  OR  Quality < 50%
   →  HUMAN_REVIEW_REQUIRED
   ↓
Confidence ≥ 75%  AND  Quality ≥ 50%  AND  No mismatch
   →  VALIDATED
```

## Key Design Principles

1. **Real AI only** — no hardcoded predictions, no fake confidence
2. **Explicit status** — MODEL STATUS always shown (TRAINED / NOT_TRAINED / DEMO)
3. **Human in the loop** — doctor review stored separately from AI prediction
4. **Evidence transparency** — every finding includes provenance
5. **Safe language** — "potential lesion", "model-indicated", never "confirmed"
6. **Graceful degradation** — MATLAB unavailable → Python fallback (labelled)
7. **Audit everything** — every AI prediction, review, and report logged

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4 |
| UI Components | Radix UI, Framer Motion, Recharts, Lucide |
| 3D Visualization | Three.js, React Three Fiber |
| Backend | FastAPI 0.135, Python 3.14 |
| Database | PostgreSQL 18, SQLAlchemy 2, Alembic |
| Authentication | JWT (python-jose), bcrypt |
| AI Framework | PyTorch 2.12, timm 1.0 |
| Image Processing | OpenCV 4.10, Pillow 12 |
| MATLAB Layer | MATLAB Engine API (fallback: Python) |
| Simulation | Simulink (fallback: Python analytical) |
| Testing | pytest (61 tests) |
