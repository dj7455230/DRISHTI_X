# DRISHTI-X — MODEL FAILURE ANALYSIS & REPAIR PLAN

**Date:** October 28, 2026  
**Investigated Repository:** `drishti-x-backup`  
**Current Baseline Metrics:**
- **Accuracy:** `38.96%`
- **Macro F1:** `0.1908`
- **Quadratic Weighted Kappa (QWK):** `0.0426`
- **Referable DR Sensitivity (Grades 2-4):** `24.51%` (Target $\ge 90\%$ **FAILED**)
- **Referable DR Specificity (Grades 0-1):** `82.95%` (Target $\ge 85\%$ **NEAR TARGET**)
- **ROC-AUC (Referable DR):** `0.5352`

---

## 1. Audit & Root Cause Analysis

### Investigation 1: Dataset Merging & Label Contamination
- **Severe Defect in `scripts/prepare_datasets.py`:**
  In `prepare_idrid()`, the script concatenated the IDRiD Training CSV (`413` rows) and IDRiD Testing CSV (`103` rows).
  - In IDRiD, the testing set reuses image filenames `IDRiD_001.jpg` through `IDRiD_103.jpg`.
  - When concatenated, `IDRiD_001` through `IDRiD_103` were mapped **twice** with conflicting labels (81 out of 103 had discordant grades between train and test).
  - `IDRiD` and `APTOS 2019` have different acquisition camera fields of view and resolution characteristics.
- **Data Leakage & Split Invalidation:**
  `train_test_split(df, test_size=0.30)` was performed randomly on the combined dataframe, splitting duplicate image filenames across both train and test partitions.
  - Furthermore, `datasets/aptos2019/` already has official, clean, non-overlapping splits:
    - `train.csv`: 2,563 images
    - `val.csv`: 549 images
    - `test.csv`: 550 images
    - **Total:** 3,662 unique images ($0$ overlap across train/val/test).

### Investigation 2: Preprocessing Discrepancy
- **Training vs. Inference Transform Mismatch:**
  - `training/transforms.py` trained with standard torchvision normalization on raw RGB images:
    `Resize(246) -> CenterCrop(224) -> ToTensor() -> Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])`
  - `ai/classification/preprocessing.py` at inference ran an aggressive CLAHE + illumination background subtraction (`img - bg + 128`), drastically altering color and local contrast distributions.
  - When passing test images through `get_inference_tensor()` into `best_model.pth`, predictions collapsed: 78% predicted Grade 0 because the model had never seen CLAHE-enhanced contrast during training.

### Investigation 3: Objective Function & Imbalance Pathology
- Standard unweighted Cross-Entropy on severe DR class imbalance (Grade 0 constitutes $>50\%$ of images, Grade 3 $<5\%$) caused the network to minimize loss by defaulting to Grade 0.
- Inverse-frequency class weights $[0.216, 1.054, 0.390, 2.021, 1.318]$ in `train_efficientnet.py` were applied to cross-entropy with a high initial learning rate ($2\times 10^{-4}$) and full-model unfreezing immediately at Epoch 1, causing gradient shocks and catastrophic forgetting in the pretrained backbone.
- Classification of diabetic retinopathy grades is an **ordinal problem** ($0 < 1 < 2 < 3 < 4$). Standard cross-entropy penalizes predicting Grade 1 for a Grade 0 truth identically to predicting Grade 4 for a Grade 0 truth, leading to erratic QWK convergence.

---

## 2. Prioritized Repair Plan

1. **Clean, Contamination-Free Data Pipeline:**
   - Use the official, verified, non-overlapping APTOS 2019 splits (`train.csv` N=2,563, `val.csv` N=549, `test.csv` N=550) as the primary training and benchmark dataset.
   - Quarantine IDRiD as an optional external test set rather than mixing conflicting filenames into training.
2. **Unified Preprocessing Pipeline:**
   - Retinal circle cropping and Graham-style local contrast enhancement / illumination normalization must be applied consistently to both training and inference.
3. **Training Architecture & Objective:**
   - EfficientNet-B0 with ImageNet pretrained weights.
   - Stage 1: Freeze backbone, train classification head only (warmup).
   - Stage 2: Fine-tune entire network with low learning rate ($3\times 10^{-5}$) and Cosine Annealing.
   - Label smoothing / Focal Loss / Class-balanced Cross-Entropy to prevent Grade 0 collapse and boost sensitivity on referable grades (2, 3, 4).
   - Validation checkpoint selection based strictly on Validation Macro F1 and QWK, never held-out test data.
4. **Independent Final Evaluation:**
   - Evaluate solely on `datasets/aptos2019/test.csv` (N=550) with confusion matrix, per-class F1, QWK, sensitivity, specificity, and ROC-AUC.
