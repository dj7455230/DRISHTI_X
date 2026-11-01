# DRISHTI-X — AI Model Architecture, Checkpoints & Inference Documentation

This document describes the deep learning models, training provenance, inference pipeline, calibration, and explainability systems used in DRISHTI-X.

---

## 1. Diabetic Retinopathy Classification Model

- **Architecture:** EfficientNet-B0 (custom classification head with Dropout $p=0.3$ and Linear layer).
- **Checkpoints:** [`models/weights/best_model.pth`](file:///Users/devanshjain06/Desktop/aictr/models/weights/best_model.pth) (16MB).
- **Classes:** 5-Grade Diabetic Retinopathy Severity:
  - `Grade 0`: No DR (No apparent retinopathy)
  - `Grade 1`: Mild NPDR (Microaneurysms only)
  - `Grade 2`: Moderate NPDR (More than microaneurysms, less than severe)
  - `Grade 3`: Severe NPDR (4-2-1 rule: hemorrhages in 4 quadrants, venous beading in 2, IRMA in 1)
  - `Grade 4`: Proliferative DR (Neovascularization, vitreous hemorrhage)
- **Input Dimensions:** $3 \times 224 \times 224$, normalized with ImageNet mean `[0.485, 0.456, 0.406]` and std `[0.229, 0.224, 0.225]`.
- **Temperature Calibration:**
  - Optimal temperature parameter: $T = 1.1638$ stored in [`models/weights/temperature.json`](file:///Users/devanshjain06/Desktop/aictr/models/weights/temperature.json).
  - Softmax calibrated logits: $\hat{p}_i = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}$ to prevent overconfident misclassifications.
- **Device Support:** Apple Silicon MPS (`torch.device("mps")`) with automatic fallback to CPU or CUDA.

---

## 2. Microvascular Lesion Segmentation Model

- **Architecture:** 4-stage Encoder/Decoder U-Net with skip connections.
- **Checkpoints:** [`models/weights/unet_lesion.pth`](file:///Users/devanshjain06/Desktop/aictr/models/weights/unet_lesion.pth) (118MB).
- **Output Classes (4 Channels):**
  - Channel 0: Retinal Background
  - Channel 1: Microaneurysms (Green overlay `#00FF00`)
  - Channel 2: Hemorrhages (Red overlay `#FF1E50`)
  - Channel 3: Hard Exudates (Yellow/Gold overlay `#FFD700`)
- **Input Dimensions:** $3 \times 512 \times 512$.
- **Post-Processing:**
  - Connected component extraction with OpenCV (`cv2.connectedComponentsWithStats`).
  - Calculates count, total pixel area, retinal coverage percentage, and bounding boxes for each lesion category.

---

## 3. Grad-CAM Visual Explainability

- **Target Conv Layer:** `backbone.features` (last convolutional layer of EfficientNet-B0).
- **Mechanism:**
  - Computes gradients of the target class logit with respect to the feature map activations.
  - Global average pools gradients to compute importance weights $\alpha_k$.
  - Takes positive linear combination followed by ReLU: $L_{\text{Grad-CAM}} = \text{ReLU}\left(\sum_k \alpha_k A^k\right)$.
  - Upsamples to original image resolution and overlays as a transparent heatmap.
- **Clinical Labeling:** Clearly marked as an AI Attention Visualization, NOT a validated anatomical segmentation.

---

## 4. Evidence Concordance & Mismatch Detection

The Clinical Assurance Engine ([`ai/assurance/clinical_assurance_service.py`](file:///Users/devanshjain06/Desktop/aictr/ai/assurance/clinical_assurance_service.py)) continuously audits predictions:
- **Rule R01:** If Predicted Grade is Severe (Grade 3) or PDR (Grade 4) but zero lesions are detected by U-Net $\rightarrow$ Flags `HUMAN_REVIEW_REQUIRED: HIGH_GRADE_ZERO_LESIONS`.
- **Rule R02:** If Predicted Grade is No DR (Grade 0) but significant hemorrhages or exudates are detected $\rightarrow$ Flags `HUMAN_REVIEW_REQUIRED: LOW_GRADE_SIGNIFICANT_LESIONS`.
- **Rule R03:** If image quality is ungradable ($Q < 50$) $\rightarrow$ Flags `RECAPTURE_REQUIRED`.

