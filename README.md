# DRISHTI-X
## AI-Assisted Retinal Microvasculature Diagnostics Platform
### *See Beyond the Retina. Understand Every Signal.*

---

> **CLINICAL NOTICE:**  
> **DRISHTI-X is an AI-assisted screening prototype.** Its outputs are not a substitute for examination or diagnosis by a qualified ophthalmologist.

---

## Overview

**DRISHTI-X** is an interactive, 3D-powered medical AI platform engineered for diabetic retinopathy (DR) screening, retinal microvasculature assessment, and rural clinical outreach.

The platform unites deep learning computer vision, temperature-calibrated classification, U-Net lesion segmentation, genuine backpropagation Grad-CAM feature attribution, and a real-time procedural 3D anatomical eye visualization built in WebGL.

---

## Key Capabilities

1. **Interactive 3D Anatomical Eye Explorer (`/eye-explorer`)**:
   - Complete anatomical hierarchy rendered in Three.js and React Three Fiber: Sclera, Cornea, Iris, Pupil, Crystalline Lens, Vitreous Body, Posterior Retina, Optic Disc, Fovea Centralis, and branching retinal vascular arcades.
   - Dedicated **Retinal Inspection Mode**: Transitions the camera toward the posterior fundus surface, highlighting the vascular tree, optic disc, and macula.
   - 360° orbit controls, smooth zoom, cutaway cross-section, and interactive anatomical hotspots with clinical annotations.

2. **Advanced Retinal Image Analysis Workspace (`/analysis`)**:
   - High-resolution fundus inspection with continuous zoom (1.0x to 4.0x), pan, 90° rotation, and reset.
   - Multi-mode display: Composite Overlay, Side-by-Side Split, and Before/After Curtain Comparison Slider.
   - Independent AI visualization layers: Fundus base, CLAHE enhancement, Grad-CAM attention heatmap (0–100% opacity slider), and U-Net lesion masks.
   - Specific lesion candidate detection for **Microaneurysms (Green)**, **Retinal Hemorrhages (Red)**, and **Hard Exudates (Cyan/Blue)**.

3. **Smart Retina Quality Gate**:
   - Immediate pre-inference check evaluating focus blur (Laplacian variance), illumination balance (histogram distribution), and field-of-view (FOV) coverage.
   - Actionable recapture guidance when images are ungradable.

4. **Temperature-Calibrated 5-Grade DR Classification**:
   - EfficientNet-B0 backbone trained on combined APTOS 2019 + IDRiD datasets.
   - Post-hoc temperature calibration ($T = 1.604$) to prevent overconfident predictions.
   - Full probability distributions across Grades 0–4 and Shannon entropy uncertainty.

5. **Diagnostic Command Center (`/dashboard`)**:
   - Real-time clinical statistics, model node health, embedded 3D Anatomical Eye Hero viewer, priority referral queue, and quick action workflows.

6. **Automated Clinical PDF Reports (`/reports`)**:
   - Compiles structured JSON and ReportLab PDF documents with case metadata, quality scores, AI classification, Grad-CAM thumbnails, lesion candidate tables, and mandatory clinical disclaimers.

7. **Rural Offline Screening Mode**:
   - IndexedDB binary persistence for offline health camps in remote regions with automatic batch synchronization when network connectivity is restored.

---

## AI Checkpoints & Model Status

| Component | Architecture | Weights Checkpoint | Status |
|:---|:---|:---|:---:|
| **DR Classifier** | `EfficientNet-B0` | `models/weights/best_model.pth` (16.4 MB) | **TRAINED & ACTIVE** |
| **Lesion Segmenter** | 4-Stage U-Net | `models/weights/unet_lesion.pth` (31.1 MB) | **TRAINED & ACTIVE** |
| **Temperature Calibration** | Platt / Temperature | `models/weights/temperature.json` ($T=1.604$) | **FITTED & ACTIVE** |
| **Grad-CAM Attribution** | Layer Hooks (`features.8.0`)| Dynamic backpropagation | **OPERATIONAL** |
| **Quality Engine** | Signal Processing | Laplacian Variance & Histograms | **OPERATIONAL** |

---

## Quick Start

### 1. Launch Platform (macOS / Linux)
```bash
bash start.sh
```

### 2. Manual Execution
**Backend (FastAPI):**
```bash
export PYTHONPATH="$(pwd)/backend:$(pwd)"
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --app-dir backend
```
- API Documentation: `http://localhost:8000/api/docs`
- Health Check: `http://localhost:8000/api/health`

**Frontend (Next.js 16.3 + React 19):**
```bash
cd frontend
npm run dev
```
- Open `http://localhost:3000`

---

## Automated Verification

```bash
# Run backend PyTest suite (123 test cases)
pytest tests/

# Run frontend Next.js production build
npm --prefix frontend run build

# Run frontend ESLint code quality check
npm --prefix frontend run lint
```

---

## Documentation

- `docs/FINAL_IMPLEMENTATION_AUDIT.md`: Complete audit of code, models, data, and routes.
- `docs/FINAL_IMPLEMENTATION_PLAN.md`: 9-phase systematic architecture and transformation plan.
- `docs/FINAL_IMPLEMENTATION_REPORT.md`: Comprehensive completion report and test verification.
- `docs/FEATURE_STATUS.md`: Feature-by-feature operational status matrix.
- `docs/RUN_AND_DEPLOY.md`: Step-by-step installation, credentials, and deployment guide.
