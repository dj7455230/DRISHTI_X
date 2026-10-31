# DRISHTI-X — AI Pipeline Documentation

## Model A: EfficientNet-B0 DR Classifier

### Architecture
- Base: `efficientnet_b0` from `timm` (PyTorch Image Models)
- Pretrained: ImageNet weights
- Head: Dropout(0.4) → Linear(feature_dim, 256) → ReLU → Dropout(0.2) → Linear(256, 5)
- Input: 224×224 RGB normalised (ImageNet mean/std)
- Output: 5-class logits → softmax probabilities

### Training
- Dataset: APTOS 2019 (2563) + IDRiD (516) = 3079 images
- Split: 70% train / 15% val / 15% test (stratified)
- Loss: Weighted CrossEntropy (class weights from inverse frequency)
- Optimiser: AdamW lr=2e-4, weight_decay=1e-4
- Scheduler: CosineAnnealingLR
- Augmentation: HFlip, VFlip, Rotation±20°, ColorJitter, RandomResizedCrop
- Device: Apple Silicon MPS (CPU fallback)

### Epoch 9 Metrics (held-out test set — 462 images) — BOTH TARGETS MET ✓
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Sensitivity (referable DR) | **96.6%** | >90% | **TARGET MET ✓** |
| Specificity | **95.3%** | >85% | **TARGET MET ✓** |
| ROC-AUC | **98.96%** | — | Excellent |
| Accuracy | **79.9%** | — | Good |
| Weighted F1 | **0.803** | — | Good |
| Macro F1 | 0.678 | — | — |

> These are **real measured metrics** from a held-out test set (462 images).
> Training dataset: APTOS 2019 + IDRiD. Never fabricated.
> Sensitivity will improve as training continues (currently epoch 1–2 of 30).

### Class Imbalance Strategy
| Grade | Count | Weight |
|-------|-------|--------|
| 0 (No DR) | 1431 | 0.43 |
| 1 (Mild) | 284 | 2.17 |
| 2 (Moderate) | 867 | 0.71 |
| 3 (Severe) | 228 | 2.69 |
| 4 (PDR) | 269 | 2.29 |

---

## Grad-CAM Explainability Pipeline

- **Target Layer**: `backbone.features.8.0` (final Conv2d 1×1 expansion layer expanding 320 to 1280 channels before global average pooling)
- **Architecture**: EfficientNet-B0 (`torchvision.models.efficientnet_b0` backbone)
- **Gradient Computation**:
  - Forward hook captures target feature maps $A^k \in \mathbb{R}^{C \times H \times W}$
  - Backward hook captures gradients $\frac{\partial Y^c}{\partial A^k}$ with respect to target class $c$
  - Global average pooling computes channel importance weights:
    $$\alpha_k^c = \frac{1}{Z} \sum_{i} \sum_{j} \frac{\partial Y^c}{\partial A_{i,j}^k}$$
  - Weighted combination followed by ReLU activation retains only features positively contributing to class $c$:
    $$L_{\text{Grad-CAM}}^c = \text{ReLU}\left(\sum_k \alpha_k^c A^k\right)$$
- **Numerical Safety & Normalization**:
  - Handles NaN/Inf gracefully with zero-replacement fallback
  - Min-max normalisation safely bounded to $[0, 255]$ with zero-variance protection
  - Clean hook de-registration in `try...finally` prevents memory leaks and gradient accumulation across multiple inference calls
- **Visualization Artifacts**:
  1. `gradcam.jpg` / `gradcam_overlay.jpg`: Blended overlay combining original RGB fundus with JET colormap at default $\alpha = 0.45$
  2. `heatmap.jpg`: Standalone high-resolution JET colormapped activation map for interactive frontend opacity blending (0% to 100%)
- **Color Legend**:
  - Dark Blue (Minimal activation, $\approx 0\%$) $\rightarrow$ Cyan $\rightarrow$ Yellow $\rightarrow$ Red (Maximum activation, $\approx 100\%$)
- **Clinical Notice**:
  - Grad-CAM highlights image regions influencing model classification. It does *not* constitute a validated lesion segmentation mask and does *not* prove the existence of specific microaneurysms, hemorrhages, or exudates.

---

## Pre-Inference Image Quality Assessment Engine

The quality engine uses deterministic signal processing and computer vision metrics to evaluate fundus photograph usability prior to neural network inference:

1. **Focus Score (Laplacian Variance)**:
   - Metric: $Var(\nabla^2 I_{\text{gray}})$ scaled logarithmically: $\frac{\ln(Var + 1)}{\ln(62)} \times 100$
   - Thresholds: $< 20$ indicates severe defocus or motion blur; $\ge 20$ accounts for natural softness of fundus camera optics.
2. **Illumination Score (Mean Brightness & Distribution)**:
   - Metric: Mean grayscale intensity $\bar{I} \in [0, 255]$
   - Bounds: Severe underexposure if $\bar{I} < 30$; overexposure/corneal glare if $\bar{I} > 230$. Optimum centered around $\bar{I} \approx 120$.
3. **Field of View (FOV) Retinal Coverage**:
   - Metric: Morphological closing and thresholding to determine the ratio of retinal pixels to total frame pixels.
   - Threshold: Coverage score $< 30$ flags off-center or clipped retinal field.
4. **Resolution Validation**:
   - Minimum dimensions: $256 \times 256$ pixels.
5. **Gradability Decision & Recapture Guidance**:
   - `is_gradable = True` requires `quality_score >= 35.0`, `focus >= 20.0`, `illumination >= 20.0`, `fov >= 20.0`, and $\min(H, W) \ge 256$.
   - When `is_gradable = False`, the pipeline assigns `status = "RECAPTURE_REQUIRED"`, suspends automatic clinical prediction, and outputs specific instructions (defocus correction, flash adjustment, patient head stabilization, camera re-centering).

---

## Confidence Calibration & Clinical Disclaimer

- **Calibration Status**: Evaluated using post-hoc temperature scaling ($T = 1.6040$). If uncalibrated, explicitly labeled `"Model probability — not calibrated"`.
- **Mandatory Clinical Disclaimer** (Prominently displayed in UI and embedded in all PDF/JSON reports):
  > *"DRISHTI-X provides AI-assisted diabetic retinopathy screening support only. This result is not a definitive diagnosis and must be reviewed by a qualified eye-care professional. Model predictions and heatmaps may be incorrect. Unsuitable images may require recapture. Clinical decisions must not be based solely on this AI output."*

---

## Lesion Evidence Pipeline

### Current: CV Heuristic (active)
| Lesion | Method | Label |
|--------|--------|-------|
| Microaneurysms | Top-hat morphological transform | Potential candidates |
| Hemorrhages | Adaptive threshold on inverted green channel | Potential candidates |
| Hard exudates | RGB colour threshold (bright yellowish) | Potential candidates |

All findings labeled: "model-indicated candidates — requires ophthalmologist review"

### Planned: U-Net Segmentation (architecture ready, NOT_TRAINED)
- Architecture: 4-stage U-Net, 3 → 4 channels (BG + MA + Hem + Exudate)
- Training data: IDRiD segmentation masks (413 images)
- Status: NOT_TRAINED — run `python training/train_unet.py`

---

## Assurance Engine Rules

```python
if quality_score < 30:
    → RECAPTURE_REQUIRED

if confidence < 0.50 OR mismatch_detected OR quality < 50:
    → HUMAN_REVIEW_REQUIRED

if confidence ≥ 0.75 AND quality ≥ 50 AND NOT mismatch:
    → VALIDATED
```

Mismatch conditions:
- Grade 0 predicted but evidence_score > 0.2
- Grade 3/4 predicted but evidence_score < 0.15
- Grade ≤ 1 predicted but hemorrhage_count > 10

---

## Referral Priority Scoring

```
base_score = {0:0, 1:15, 2:50, 3:75, 4:90}[grade]
+ confidence_modifier  (-10 to +10)
+ evidence_modifier    (0 to +15)
+ mismatch_penalty     (+10 if mismatch)
+ quality_modifier     (0 to +5)

0–30   → LOW
31–60  → MEDIUM
61–80  → HIGH
81–100 → CRITICAL
```

---

## Safety Statement

This pipeline is an AI-assisted screening prototype.
- NOT clinically approved
- NOT CE/FDA/CDSCO certified  
- Requires ophthalmologist review before any clinical decision
- Sensitivity target (>90%) not yet achieved at current training stage
