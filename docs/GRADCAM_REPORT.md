# DRISHTI-X — Grad-CAM Explainability Technical Report
**Feature 13 Implementation Deliverable**
**Date:** October 31, 2026  
**Status:** VALIDATED & OPERATIONAL ON TRAINED WEIGHTS

---

## 1. Overview

Feature 13 provides authentic Gradient-Weighted Class Activation Mapping (Grad-CAM) explainability for the EfficientNet-B0 diabetic retinopathy classifier. It computes gradient backpropagation through the final convolutional feature maps to localize the retinal regions that most heavily influenced the model's categorical classification decision.

---

## 2. Mathematical Formulation

Given an input fundus image tensor $X$, let $A^k$ represent the forward activation map of the $k$-th feature channel of the target convolutional layer, and let $Y^c$ be the unnormalized logit score for target DR grade $c \in \{0, 1, 2, 3, 4\}$.

### Step 1: Neuron Importance Weights
The importance weight $\alpha_k^c$ of feature map $k$ for class $c$ is computed by global-average-pooling the gradients of $Y^c$ with respect to $A^k$:

$$\alpha_k^c = \frac{1}{Z} \sum_{i=1}^H \sum_{j=1}^W \frac{\partial Y^c}{\partial A_{i,j}^k}$$

where $Z = H \times W$ is the spatial area of the feature map ($7 \times 7$ at the final stage of EfficientNet-B0).

### Step 2: Linear Combination & Rectification
The coarse 2D Grad-CAM saliency map $L_{\text{Grad-CAM}}^c$ is computed as a weighted linear combination followed by a Rectified Linear Unit (ReLU) to isolate features that positively contribute to class $c$:

$$L_{\text{Grad-CAM}}^c = \text{ReLU}\left( \sum_{k=1}^K \alpha_k^c A^k \right)$$

### Step 3: Bilinear Upsampling & Colormapping
The coarse map $L_{\text{Grad-CAM}}^c$ ($7 \times 7$) is normalized to $[0, 1]$, upsampled via bilinear interpolation to the native image resolution $(W_{\text{orig}}, H_{\text{orig}})$, and converted to an RGB JET colormap:

$$\text{Heatmap}_{\text{JET}} = \text{ColorMap}_{\text{JET}}\left(\text{Resize}\left(\frac{L - \min(L)}{\max(L) - \min(L) + \epsilon}, (W, H)\right)\right)$$

### Step 4: Alpha Blending
The heatmap is blended with the original fundus image:

$$I_{\text{overlay}} = \alpha \cdot \text{Heatmap}_{\text{JET}} + (1 - \alpha) \cdot I_{\text{original}}$$

where $\alpha$ is default set to $0.45$.

---

## 3. Architecture & Target Layer Verification

- **Model Backbone:** `DrishtiEfficientNet` (torchvision `efficientnet_b0` backbone + ImageNet pretrained weights + 5-class custom head).
- **Target Convolutional Layer:** `backbone.features.8.0` (final stage convolutional bottleneck before global pooling).
- **Hook Implementation:**
  - Forward Hook: Captures feature activation tensor $A \in \mathbb{R}^{1 \times 1280 \times 7 \times 7}$.
  - Backward Hook: Captures gradient tensor $\frac{\partial Y^c}{\partial A} \in \mathbb{R}^{1 \times 1280 \times 7 \times 7}$.
  - Hook Cleanup: Automatically detached in a `finally` block to prevent GPU/MPS memory leaks.

---

## 4. API Endpoints

- `POST /api/screenings/{id}/gradcam`: Computes Grad-CAM with optional parameters (`target_class`, `alpha`).
- `GET /api/screenings/{id}/explainability`: Returns visual artifact URLs (`gradcam_heatmap.jpg`, `gradcam_overlay.jpg`), target layer name, class activation score, and metadata.

---

## 5. Distinction: Grad-CAM vs. Lesion Segmentation

| Property | Grad-CAM (Feature 13) | U-Net Segmentation (Feature 11) |
|:---|:---|:---|
| **Model** | EfficientNet-B0 Classifier | U-Net Lesion Segmenter |
| **Input Data** | Whole image ($224 \times 224$) | High-res fundus ($512 \times 512$) |
| **Output Representation** | Coarse continuous saliency heatmaps | Sharp, pixel-level binary/probability masks |
| **Meaning** | "Where the classifier looked" | "Where morphological lesions are present" |
| **Resolution** | Coarse ($7 \times 7$ upsampled) | Fine ($512 \times 512$ native) |
| **Pathology Specificity** | Non-specific global attention | Class-specific (MA, HE, EX) |

