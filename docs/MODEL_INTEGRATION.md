# DRISHTI-X — Model Integration & Evaluation Architecture

**Models Integrated:**
1. **EfficientNet-B0** (Diabetic Retinopathy 5-Grade Classifier)
2. **U-Net** (Microvascular Retinal Lesion Segmenter)
3. **Temperature Scaling** (Empirical Probability Calibrator)
4. **Grad-CAM** (Feature Attribution Explainability)

---

## 1. Model Artifacts

| Component | Checkpoint File | Size | Parameters | Status |
| :--- | :--- | :--- | :--- | :--- |
| **EfficientNet-B0** | `models/weights/best_model.pth` | 19.4 MB | 4,013,949 | TRAINED (Epoch 6) |
| **Temperature Calibration** | `models/weights/temperature.json` | 51 B | $T = 1.1638$ | FITTED |
| **U-Net Lesion Segmenter** | `models/weights/unet_lesion.pth` | 118.4 MB | 31,037,828 | TRAINED (Epoch 14) |

---

## 2. Preprocessing & Input Parity

Strict parity between training and inference pipelines:

```
[Original Fundus Photograph]
          |
          +--> Resize to 224x224 (Classification) -> ToTensor() -> ImageNet Norm -> EfficientNet-B0 -> Logits (5)
          |                                                                                               |
          |                                                                               Temperature Scale (T=1.1638)
          |                                                                                               |
          |                                                                                   Softmax -> Calibrated Probs
          |
          +--> Resize to 512x512 (Segmentation)   -> ToTensor() -> ImageNet Norm -> U-Net -> [1, 4, 512, 512] Mask
```

### Preprocessing Constants
- **Classification Size:** $224 \times 224$
- **Segmentation Size:** $512 \times 512$
- **Mean:** `[0.485, 0.456, 0.406]`
- **Std:** `[0.229, 0.224, 0.225]`

---

## 3. Post-Hoc Temperature Scaling

Given raw neural network logits $z \in \mathbb{R}^5$ and scalar temperature $T > 0$:

$$\hat{p}_i = \frac{\exp(z_i / T)}{\sum_{j=1}^5 \exp(z_j / T)}$$

- Fitted Temperature: $T = 1.1638$
- Optimisation criterion: Negative Log-Likelihood (NLL) minimization on held-out validation set.
- Effect: Mitigates overconfidence in borderline cases (Grades 1 and 2).

---

## 4. Evaluation Benchmark Summary

| Evaluation Suite | Dataset | Samples ($N$) | Primary Metric | Sensitivity | Specificity | ROC-AUC |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Classification Test** | APTOS 2019 (Held-out) | 550 | **QWK: 0.8185** | 82.06% | 94.50% | 0.9675 |
| **Lesion Segmentation** | IDRiD (Held-out Test) | 27 | **Val Loss: 0.9353** | 15.42% (Hard Ex) | - | - |
| **External Cohort** | Messidor-2 | 1,744 | **Accuracy: 61.47%** | 27.13% | 98.99% | 0.7924 |

