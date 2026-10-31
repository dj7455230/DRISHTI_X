# DRISHTI-X — Feature Implementation Report
**Platform:** DRISHTI-X | AI-Assisted Retinal Microvasculature Diagnostics  
**Architecture:** Next.js 16 (App Router) + FastAPI + PostgreSQL / SQLite + PyTorch (MPS)  
**Verification Date:** 2026-10-31  

---

## 1. Executive Summary

This report documents the implementation and clinical validation of the 10 master features across DRISHTI-X. All machine learning weights are genuinely trained and evaluated on real project datasets (**APTOS 2019**, **IDRiD**, and **Messidor-2**) on Apple Silicon M4 (`mps` device). No mock scores, simulated weights, or fabricated metrics exist in the pipeline.

```
+---------------------------------------------------------------------------------------+
|                                    DRISHTI-X CORE PIPELINE                           |
|                                                                                       |
|  [Intake / Demographics] -> [Quality Gate Check] -> [EfficientNet-B0 + U-Net]        |
|           |                           |                           |                   |
|     RBAC Protected               Smart Recapture             Temperature Calibrated   |
|     (Health Worker /             (Laplacian / FOV /          (T = 1.1638, Grad-CAM,   |
|      Doctor / Admin)              Contrast / Focus)           5-Grade Lesion Mask)    |
|                                                                   |                   |
|                                                          [Doctor Review Sign-off]     |
|                                                          (Ophthalmologist Authority)  |
+---------------------------------------------------------------------------------------+
```

---

## 2. Feature-by-Feature Implementation Details

### Feature 1: Role-Based Login and Access Control (RBAC)
- **Roles Implemented:**
  - `HEALTH_WORKER`: Clinical intake, fundus imaging, image quality check, recapture submission, patient registry.
  - `OPHTHALMOLOGIST`: Clinical review queue, AI prediction confirmation/modification, Grad-CAM inspection, lesion segmentation review, formal sign-off.
  - `ADMIN`: User account management, audit trail inspection, system health, AI model deployment status.
- **Backend Enforcement:**
  - Defined in [`backend/app/api/deps.py`](file:///Users/devanshjain06/Desktop/aictr/backend/app/api/deps.py): `require_health_worker`, `require_doctor`, `require_admin`, and `require_roles(*roles)`.
  - Passwords hashed with salted `bcrypt` (12 rounds).
  - JWT tokens issued with `sub` (User UUID) and `role`, stored via HttpOnly cookie `drishti_session` and `Authorization: Bearer` header.
  - Audit logging on every login, logout, user update, and clinical review.
- **Demo Role Quick-Select:** 1-click credential fill buttons for all 3 roles on the Login page (`/login`).

### Feature 2: New Patient Screening Workflow
- **Workflow Stepper:** 6 structured clinical stages:
  1. *Patient Demographics*: Full name, age, gender, contact number, district, state, or anonymous walk-in toggle.
  2. *Medical History*: Diabetes type (Type 1, Type 2, Gestational, Pre-diabetes), duration, treatment modality, HbA1c, blood glucose.
  3. *Symptoms & Context*: Visual symptoms (asymptomatic, blurred vision, floaters, distorted vision), eye conditions, and prior ocular surgeries.
  4. *Fundus Imaging & Quality Gate*: Eye selection (OD / OS), file upload or simulated camera capture, pre-inference quality verification.
  5. *Case Review*: Pre-analysis verification, quality gate summary, and analysis triggering.
  6. *AI Screening*: Grade classification, calibrated confidence, Grad-CAM heatmap, lesion segmentation, and PDF report export.
- **Duplicate Detection:** Automatic warning displayed if a patient with matching name or contact already exists in the system.

### Feature 3: Fundus Image Upload, Preview & Prototype Dataset Samples
- **Formats Supported:** JPEG, PNG, TIFF, BMP (up to 20MB).
- **Format Validation:** Real-time checking of file extensions, MIME types, and dimensions.
- **Prototype Demonstration Datasets:** Curated 1-click selectors wired directly to the real datasets:
  - *APTOS 2019*: `000c1434d8d7.png` (Known Ground Truth: Grade 2 — Moderate DR).
  - *IDRiD*: `IDRiD_001.jpg` (Known Ground Truth: Grade 3 — Severe DR).
  - *Messidor-2*: `20051020_43808_0100_PP.png` (Known Ground Truth: Grade 0 — No DR).

### Feature 4: Fundus Camera Integration Placeholder (Simulated Hardware)
- **Acquisition Mode Toggle:** Switch between "Upload from Device" and "Capture from Fundus Camera".
- **Supported Camera Profiles:**
  - *Forus 3nethra classic* (45° Non-Mydriatic Fundus Camera)
  - *Remidio Fundus on Phone* (FOP NM-10 Handheld Smartphone Camera)
  - *Topcon NW400* (Robotic Non-Mydriatic Retinal Camera)
  - *Canon CR-2 AF* (Digital Retinal Camera)
- **Simulated Hardware Controls:** Retinal viewfinder with crosshair reticle, "Trigger Camera Capture", "Retake", and explicit production disclosure:
  > *"Camera interface simulated for prototype demonstration. Direct hardware integration via DICOM / USB capture is a planned production feature."*

### Feature 5: Image Format and Basic Pre-Validation
- Validates magic bytes, decodability via OpenCV/PIL, aspect ratio, and minimum dimensions.
- Corrupted, empty, or wrong-dimension files are rejected immediately before disk storage or model execution.

### Feature 6: Training and Inference Preprocessing Parity
- **Resolution:**
  - Classification (EfficientNet-B0): Exactly $224 \times 224$ pixels.
  - Segmentation (U-Net): Exactly $512 \times 512$ pixels.
- **Normalization:** ImageNet mean `[0.485, 0.456, 0.406]` and std `[0.229, 0.224, 0.225]`.
- Identical torchvision transform pipeline used in both training and production inference (`training/transforms.py` and `ai/inference/inference_service.py`).

### Feature 7: Automated Image Quality Assessment
- **Metrics Computed:**
  - *Focus / Sharpness Score:* Variance of the Laplacian ($\text{Var}(\nabla^2 I)$).
  - *Illumination / Exposure Score:* Mean luminance ($\mu(Y)$) in YCrCb space.
  - *Contrast Score:* Standard deviation of grayscale pixel intensities ($\sigma(I_{\text{gray}})$).
  - *Field of View (FOV) Score:* Retinal circular mask coverage and boundary centering.
- **Categories:**
  - `Good`: Sharp vascular definition, optimal exposure, well-centered.
  - `Borderline`: Acceptable with minor illumination/focus variances.
  - `Poor` (`UNGRADABLE`): Severe blur, underexposure, glare, or poor FOV.

### Feature 8: Smart Recapture Guidance
- **Actionable Corrective Guidance:** Structured `detected_issues` with specific clinical remedies:
  - *Blur Detected:* "Hold camera steady; verify focus on retinal microvasculature."
  - *Low Illumination / Underexposure:* "Increase flash intensity; ensure pupil is sufficiently dilated."
  - *Overexposure / Glare:* "Reduce illumination; check for corneal reflections."
  - *Poor Field of View:* "Re-center camera on the posterior pole (macula and optic disc)."
- **Quality Gate Gating:**
  - When quality is Poor, advancing to DR classification is blocked.
  - One-click "Recapture Image" resets the stage.
  - Explicit clinical override checkbox is required if an ungradable image must be reviewed.

### Feature 9: DR Classification with Genuinely Trained EfficientNet-B0
- **Model Checkpoint:** `models/weights/best_model.pth` (19.4 MB).
- **Training Epochs:** 8 epochs on APTOS 2019 ($N=2,563$ train, $N=549$ val).
- **Output:** 5 clinical grades (0: No DR, 1: Mild, 2: Moderate, 3: Severe, 4: Proliferative).

### Feature 10: Calibrated Prediction Confidence & Explainability
- **Post-Hoc Temperature Scaling:** Temperature $T = 1.1638$ fitted on validation logits and saved to `models/weights/temperature.json`.
- **Probabilities:** Full 5-grade distribution displayed with progress indicators.
- **Grad-CAM:** Backpropagation feature attribution map on target layer `backbone.features.8.0`.
- **U-Net Segmentation:** Multi-class lesion masks (microaneurysms, hemorrhages, hard exudates).
- **Mandatory Disclaimers:** Visible in both UI and PDF report:
  > *"AI-assisted screening prototype, not a substitute for an ophthalmologist's diagnosis."*

---

## 3. Genuine Model Training & Evaluation Metrics

All models were evaluated on real held-out test splits without data leakage:

### A. EfficientNet-B0 DR Classification (Held-Out APTOS Test Set, N=550)
- **Quadratic Weighted Kappa (QWK):** **0.8185** (Clinical target achieved: $> 0.80$)
- **Accuracy:** **74.36%**
- **Weighted F1-Score:** **0.7489**
- **Referable DR Sensitivity:** **82.06%**
- **Referable DR Specificity:** **94.50%** (Clinical target achieved: $\ge 85\%$)
- **ROC-AUC:** **0.9675**
- **Report File:** [`reports/evaluation_results.json`](file:///Users/devanshjain06/Desktop/aictr/reports/evaluation_results.json)

### B. U-Net Lesion Segmentation (Held-Out IDRiD Testing Set, N=27)
- **Model Checkpoint:** `models/weights/unet_lesion.pth` (118.4 MB)
- **Parameters:** 31,037,828
- **Trained Epochs:** 15 epochs on IDRiD segmentation groundtruths
- **Best Validation Loss:** **0.9353**
- **Hard Exudate Precision:** **15.42%**
- **Report File:** [`reports/unet_evaluation.json`](file:///Users/devanshjain06/Desktop/aictr/reports/unet_evaluation.json)

### C. External Validation (Messidor-2 Cohort, N=1,744)
- **Total Gradable Images:** 1,744
- **Accuracy:** **61.47%**
- **Specificity:** **98.99%**
- **ROC-AUC:** **0.7924**
- **Report File:** [`reports/messidor2_external_evaluation.json`](file:///Users/devanshjain06/Desktop/aictr/reports/messidor2_external_evaluation.json)

---

## 4. Test Suite Verification

- **Pytest Suite:** **123 passed, 0 failed** in 36.19s across 13 test modules:
  - `tests/test_api.py` (9 passed)
  - `tests/test_assurance.py` (12 passed)
  - `tests/test_audit_features.py` (9 passed)
  - `tests/test_clinical_screening_workflow.py` (12 passed)
  - `tests/test_google_auth.py` (20 passed)
  - `tests/test_gradcam.py` (6 passed)
  - `tests/test_lesion_evidence.py` (7 passed)
  - `tests/test_model.py` (7 passed)
  - `tests/test_preprocessing.py` (6 passed)
  - `tests/test_quality.py` (8 passed)
  - `tests/test_screening_explainability.py` (11 passed)
  - `tests/test_screening_intake_workflow.py` (10 passed)
  - `tests/test_simulation.py` (6 passed)
- **Next.js Production Build:** **19 of 19 routes compiled successfully** (`npm run build`).

