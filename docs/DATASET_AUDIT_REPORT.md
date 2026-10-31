# DRISHTI-X | Comprehensive Dataset Audit Report

**Audit Date:** 2026-10-31 12:26:10 UTC  
**Auditor:** DRISHTI-X Autonomous Verification Pipeline  
**Datasets Inspected:** APTOS 2019, IDRiD, Messidor-2  

---

## 1. Executive Summary

A comprehensive inventory and clinical data audit was performed across all three datasets integrated into DRISHTI-X. All original files in `datasets/` have been verified for integrity, format consistency, label structure, and spatial mask alignment without modifying or moving original files.

| Dataset | Primary Role | Total Verified | Labels / Annotations | Status |
|---|---|---|---|---|
| **APTOS 2019** | 5-Grade DR Classification Training & Val | 3,662 train + 1,928 test | ICDR Grades 0–4 (Clean 70/15/15 Split) | **VALIDATED** |
| **IDRiD** | Lesion Segmentation (MA, HE, EX, OD) | 81 fundus images (54 train, 27 test) | Pixel-level binary masks ($2848 \times 4288$) | **VALIDATED** |
| **Messidor-2** | Independent External Clinical Validation | 1,744 images (100% matched) | Adjudicated ICDR Grades 0–4 & DME status | **VALIDATED** |

---

## 2. APTOS 2019 Blindness Detection Dataset

- **Physical Path:** `datasets/aptos2019/`
- **Total Images on Disk:** 3662 in `train_images/`, 1928 in `test_images/`.
- **Image Format:** PNG ($1050 \times 1050$, $2136 \times 3216$, and various high-resolution fundus dimensions).
- **Stratified Split Integrity:**
  - **Train Split (`train.csv`):** 2563 images
    - Grade 0: 1263 (49.3%)
    - Grade 1: 259 (10.1%)
    - Grade 2: 699 (27.3%)
    - Grade 3: 135 (5.3%)
    - Grade 4: 207 (8.1%)
  - **Validation Split (`val.csv`):** 549 images
  - **Held-out Test Split (`test.csv`):** 550 images (Preserved strictly for final unbiased metrics)
- **Missing / Corrupted Images:** 0 found.

---

## 3. IDRiD (Indian Diabetic Retinopathy Image Dataset)

- **Physical Path:** `datasets/idrid/`
- **Resolution:** Uniform $2848 \times 4288$ native resolution across all original fundus images.
- **Lesion Segmentation Annotations:**
  - **Microaneurysms (MA):** 54 train masks, 27 test masks (100% paired).
  - **Haemorrhages (HE):** 53 train masks, 27 test masks (98.1% paired in train, 100% in test).
  - **Hard Exudates (EX):** 54 train masks, 27 test masks (100% paired).
  - **Optic Disc (OD):** 54 train masks, 27 test masks (100% paired).
  - **Soft Exudates (SE / Cotton Wool Spots):** 26 train masks, 14 test masks (Clinically expected sparsity: only a fraction of patients manifest cotton wool spots).
- **Disease Grading Subset:** 413 training images and 103 testing images with ICDR clinical grades.

---

## 4. Messidor-2 External Clinical Validation Dataset

- **Physical Path:** `datasets/messidor2/archive/messidor-2/messidor-2/preprocess`
- **CSV Catalog:** `datasets/messidor2/archive/messidor_data.csv`
- **Total Cataloged:** 1744 images.
- **Images Verified on Disk:** 1744 (100% complete match).
- **Gradability:** All 1,744 images adjudicated as gradable (`adjudicated_gradable == 1`).
- **DR Grade Distribution (ICDR Adjudicated Scale):**
  - Grade 0 (No DR): 1017 (58.3%)
  - Grade 1 (Mild): 270 (15.5%)
  - Grade 2 (Moderate): 347 (19.9%)
  - Grade 3 (Severe): 75 (4.3%)
  - Grade 4 (Proliferative): 35 (2.0%)
- **Diabetic Macular Edema (DME):** 151 images positive (`adjudicated_dme == 1`), 1,593 negative.
- **Zero-Leakage Governance:** Messidor-2 will NOT be used for feature learning, backbone fine-tuning, or temperature tuning. It serves purely as an independent out-of-distribution clinical test benchmark.

---

## 5. Data Quality, Preprocessing & Leakage Safeguards

1. **Circular Mask & CLAHE Preprocessing:**
   - Raw fundus images contain uneven illumination and dark peripheral borders.
   - Circular bounding-box cropping with green-channel CLAHE (Contrast Limited Adaptive Histogram Equalization) is applied on-the-fly during training and inference.
2. **Synchronization for Segmentation:**
   - Spatial augmentations (random horizontal/vertical flip, affine rotations) are strictly synchronized across original RGB images and all target lesion masks.
3. **Class Imbalance Management:**
   - Inverse class frequency weighting is implemented in loss computation to penalize errors on minority referable grades (Grade 3 Severe and Grade 4 PDR).
