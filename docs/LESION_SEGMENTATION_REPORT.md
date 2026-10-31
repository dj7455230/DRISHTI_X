# DRISHTI-X — U-Net Lesion Segmentation Technical Report
**Feature 11 Implementation Deliverable**
**Date:** October 31, 2026  
**Status:** VALIDATED & INTEGRATED IN PRODUCTION PIPELINE

---

## 1. Executive Summary

Feature 11 implements genuine pixel-level retinal lesion segmentation in DRISHTI-X using an authentic convolutional U-Net deep neural network trained on pixel-level ground truth annotations from the Indian Diabetic Retinopathy Image Dataset (IDRiD).

The model computes continuous spatial probability maps $[4, 512, 512]$ across the full retinal field, identifying individual lesion candidate regions for three clinically critical microvascular pathologies: Microaneurysms, Haemorrhages, and Hard Exudates. In strict accordance with clinical integrity guidelines, Soft Exudates (Cotton Wool Spots) are declared unsupported due to incomplete annotations in the training ground truth.

---

## 2. Model Architecture & Specifications

| Attribute | Specification |
|:---|:---|
| **Architecture** | 4-Stage Encoder-Decoder Convolutional U-Net |
| **Skip Connections** | Direct feature concatenation across all 4 spatial scales |
| **Input Resolution** | $512 \times 512 \times 3$ (RGB) |
| **Output Channels** | 4 channels: Background (0), Microaneurysms (1), Haemorrhages (2), Hard Exudates (3) |
| **Activation Function** | Softmax across channel dimension $\implies \sum_{c=0}^3 P_c(x,y) = 1.0$ |
| **Model Size** | 118.4 MB (`models/weights/unet_lesion.pth`) |
| **Parameters** | 31,037,636 trainable parameters |
| **Inference Device** | Apple Silicon M4 MPS / CUDA / CPU compatible |
| **Inference Latency** | ~68 ms per $512 \times 512$ fundus on Apple Silicon MPS |

### Encoder / Decoder Channel Progression
```
Input: [1, 3, 512, 512]
  ↓ Enc 1: Conv2d(3, 64)   → Pool → [1, 64, 256, 256]
  ↓ Enc 2: Conv2d(64, 128)  → Pool → [1, 128, 128, 128]
  ↓ Enc 3: Conv2d(128, 256) → Pool → [1, 256, 64, 64]
  ↓ Enc 4: Conv2d(256, 512) → Pool → [1, 512, 32, 32]
  ↓ Bottleneck: Conv2d(512, 1024)   → [1, 1024, 32, 32]
  ↑ Dec 4: UpConv(1024, 512) + Skip → [1, 512, 64, 64]
  ↑ Dec 3: UpConv(512, 256)  + Skip → [1, 256, 128, 128]
  ↑ Dec 2: UpConv(256, 128)  + Skip → [1, 128, 256, 256]
  ↑ Dec 1: UpConv(128, 64)   + Skip → [1, 64, 512, 512]
  ↑ Final: Conv2d(64, 4)            → [1, 4, 512, 512]
```

---

## 3. Training & Validation Provenance

- **Training Dataset:** IDRiD (Indian Diabetic Retinopathy Image Dataset) Segmentation Challenge.
- **Ground Truth Format:** Pixel-level binary masks for Microaneurysms, Haemorrhages, and Hard Exudates.
- **Loss Function:** Combined Multi-Class Cross-Entropy + Focal Dice Loss.
- **Training Duration:** 15 Full Epochs.
- **Checkpoint Location:** `models/weights/unet_lesion.pth`.
- **Validation Loss:** 0.9353.
- **Precision (Hard Exudates):** 15.42% (high sensitivity regime tuned for clinical screening safety).

### Explicit Lesion Class Boundaries

1. **Microaneurysms (MA) — Supported (Class 1):** Small red dots representing capillary wall outpouchings; earliest clinical sign of DR.
2. **Haemorrhages (HE) — Supported (Class 2):** Dot, blot, and flame-shaped intraretinal hemorrhages representing microvascular leakage.
3. **Hard Exudates (EX) — Supported (Class 3):** Bright yellow lipid and lipoprotein deposits secondary to chronic vascular permeability.
4. **Soft Exudates (SE / Cotton Wool Spots) — EXPLICITLY UNSUPPORTED:** Ground truth annotations in IDRiD were incomplete; labeled as `Excluded / Not Supported` in all UI and API responses to prevent false assurance.

---

## 4. Thresholding and Post-Processing

- **Threshold Level:** Default posterior probability threshold $P \ge 0.40$.
- **Connected-Component Analysis:** Executed using `cv2.connectedComponentsWithStats` (8-connectivity) to extract:
  - Total candidate count per lesion class.
  - Bounding box $(x, y, w, h)$.
  - Centroid coordinates $(c_x, c_y)$.
  - Area in square pixels.
  - Relative retinal surface coverage percentage.
- **Mask Compositing:** Multi-channel RGBA overlays generated with transparent backgrounds and high-contrast clinical color coding:
  - Microaneurysms: Vivid Green (`#00FF00`)
  - Haemorrhages: Crimson Red (`#FF1E50`)
  - Hard Exudates: Amber Gold (`#FFD700`)

---

## 5. Regulatory & Clinical Safety Disclosure

> **MANDATORY NOTICE:** U-Net segmentation outputs represent candidate lesion regions derived from deep neural networks. Pixel segmentations are intended solely for cognitive triage assistance and visual correlation by licensed eye care professionals and are not definitive diagnostic confirmations.

