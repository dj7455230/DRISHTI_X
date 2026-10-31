# DRISHTI-X — MODEL CARD: EfficientNet-B0 Diabetic Retinopathy Classifier

## Model Details
- **Model Name:** DRISHTI-X EfficientNet-B0 Classifier
- **Architecture:** Torchvision `efficientnet_b0` with linear classification head (1280 features $\to$ 5 classes)
- **Model Version:** 1.0.0
- **Model Status:** `TRAINED` (Evaluated on held-out test split)
- **Framework:** PyTorch 2.6.0 on Apple Silicon MPS / CUDA / CPU
- **Input Resolution:** $224 \times 224 \times 3$ RGB retinal fundus photography
- **Pretrained Weights:** ImageNet-1K V1 features (`IMAGENET1K_V1`)
- **Weights Location:** `models/weights/best_model.pth`

---

## Intended Use & Clinical Scope
- **Intended Purpose:** Research prototype for automated diabetic retinopathy screening and triage assistance.
- **Classification Output:** 5-class International Clinical Diabetic Retinopathy (ICDR) scale:
  - Grade 0: No Apparent Retinopathy
  - Grade 1: Mild Non-Proliferative Diabetic Retinopathy (NPDR)
  - Grade 2: Moderate Non-Proliferative Diabetic Retinopathy (NPDR)
  - Grade 3: Severe Non-Proliferative Diabetic Retinopathy (NPDR)
  - Grade 4: Proliferative Diabetic Retinopathy (PDR)
- **Referable Diabetic Retinopathy Definition:** Grades 2, 3, or 4 (requiring clinical referral for specialist evaluation).
- **Clinical Contraindications & Explicit Warnings:**
  > [!CAUTION]
  > **RESEARCH PROTOTYPE ONLY — NOT FOR INDEPENDENT DIAGNOSTIC USE**  
  > This model is NOT FDA-cleared, CE-marked, or CDSCO-approved. It has NOT undergone prospective multicenter clinical trials. Model predictions and Grad-CAM visual heatmaps are exploratory aids and MUST NEVER be used as autonomous diagnostic proof. Every screening must be verified by a licensed ophthalmologist or retina specialist.

---

## Training Data & Provenance
- **Primary Training Dataset:** APTOS 2019 Blindness Detection (`train.csv`, 2,563 images) combined with IDRiD Training Set (`413` images).
- **Total Training Set:** 2,976 images
  - Distribution: `{0: 1397, 1: 279, 2: 835, 3: 209, 4: 256}`
- **Validation Set (Held-Out):** APTOS 2019 `val.csv` (549 images)
  - Distribution: `{0: 271, 1: 55, 2: 150, 3: 29, 4: 44}`
- **Test Set (Held-Out, Independent):** APTOS 2019 `test.csv` (550 images)
  - Distribution: `{0: 271, 1: 56, 2: 150, 3: 29, 4: 44}`
  - Non-overlapping: $0$ duplicate or shared images across train, validation, or test sets.

---

## Training Methodology & Hyperparameters
- **Optimization Strategy:** Two-phase transfer learning:
  - **Phase 1 (Warmup):** Backbone frozen; classification head trained for 1 epoch with AdamW ($\text{LR} = 10^{-3}$).
  - **Phase 2 (Fine-Tuning):** Full network unfreezing; differential learning rates (backbone $2\times 10^{-5}$, head $2\times 10^{-4}$) trained for 6 epochs with Cosine Annealing scheduler.
- **Loss Function:** Class-weighted Cross-Entropy with smoothed inverse class frequency weights:
  $$\text{weight}_c = \sqrt{\frac{\max_j(N_j)}{N_c}}$$
  Values: `[0.529, 1.184, 0.684, 1.368, 1.236]`
- **Data Augmentation:** Random Horizontal Flip ($p=0.5$), Random Vertical Flip ($p=0.5$), Color Jitter (brightness=0.1, contrast=0.1, saturation=0.1), Random Rotation ($\pm 15^\circ$).
- **Checkpoint Selection:** Strictly determined by peak Validation Quadratic Weighted Kappa (QWK), preserving test split independence.

---

## Quantitative Evaluation on Independent Held-Out Test Set (N=550)

| Metric | Previous Broken Baseline | DRISHTI-X Retrained | Clinical Target | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Accuracy** | 38.96% | **73.82%** | — | **+34.86%** |
| **Quadratic Weighted Kappa (QWK)** | 0.0426 | **0.8204** | $\ge 0.80$ | **TARGET MET** |
| **Macro F1-Score** | 0.1908 | **0.5394** | — | **+0.3486** |
| **Weighted F1-Score** | 0.3800 | **0.7387** | — | **+0.3587** |
| **ROC-AUC (Referable DR)** | 0.5352 | **0.9674** | $\ge 0.90$ | **TARGET MET** |
| **Referable DR Specificity (Grades 0-1)** | 82.95% | **93.27%** | $\ge 85.0\%$ | **TARGET MET** |
| **Referable DR Sensitivity (Grades 2-4)** | 24.51% | **83.86%** | $\ge 90.0\%$ | **TARGET NOT YET MET (83.9% < 90%)** |

### Per-Class Detailed Performance (Held-Out Test Set)
- **Grade 0 (No DR):** Precision: `95.3%` | Recall: `97.8%` | F1: `96.5%` (Support: 271)
- **Grade 1 (Mild NPDR):** Precision: `44.4%` | Recall: `50.0%` | F1: `47.1%` (Support: 56)
- **Grade 2 (Moderate NPDR):** Precision: `68.5%` | Recall: `59.3%` | F1: `63.6%` (Support: 150)
- **Grade 3 (Severe NPDR):** Precision: `33.3%` | Recall: `27.6%` | F1: `30.2%` (Support: 29)
- **Grade 4 (Proliferative DR):** Precision: `29.1%` | Recall: `36.4%` | F1: `32.3%` (Support: 44)

### Confusion Matrix (Test Set N=550)
$$\begin{pmatrix}
265 & 6 & 0 & 0 & 0 \\
6 & 28 & 20 & 0 & 2 \\
5 & 25 & 89 & 11 & 20 \\
1 & 0 & 3 & 8 & 17 \\
1 & 4 & 18 & 5 & 16
\end{pmatrix}$$
*(Rows: True Grade 0–4; Columns: Predicted Grade 0–4)*

### Binary Referable DR Screening Breakdown (Grade 2–4 vs Grade 0–1)
- **True Positives (TP):** 187
- **True Negatives (TN):** 305
- **False Positives (FP):** 22
- **False Negatives (FN):** 36
- **Positive Predictive Value (Precision):** 89.47%
- **Negative Predictive Value (NPV):** 89.44%

---

## Clinical Safety & Diagnostic Disclaimer
1. **Sensitivity Target Assessment:** The model achieved 83.86% sensitivity for referable diabetic retinopathy. While this represents a massive gain over the initial 24.51% failure, **it remains below the clinical screening threshold of 90.0%**. Therefore, **DRISHTI-X CANNOT be presented as an autonomous primary screening tool**.
2. **Clinical Assurance Engine:** All screenings are routed through the mandatory clinical assurance rules (`ai/clinical_assurance.py`). If confidence falls below 0.75 or lesion mask concordance diverges, the system forces a status of `HUMAN_REVIEW_REQUIRED` or `REJECTED_POOR_QUALITY`.
3. **Grad-CAM Explainability:** Grad-CAM saliency maps visualize feature activation in `backbone.features.8.0`. They highlight areas influencing model classification but do NOT constitute biological proof of lesion presence.
