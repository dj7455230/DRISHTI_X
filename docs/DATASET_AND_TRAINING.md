# DRISHTI-X — Dataset Provenance, Leakage Prevention & Training Pipeline

This document details the datasets, split protocols, data leakage prevention measures, and training procedures for DRISHTI-X.

---

## 1. Dataset Provenance & Separation

DRISHTI-X enforces strict isolation between training and validation datasets:

| Dataset | Modality / Labels | Assigned Role | Split Manifest | Images / Samples |
|---|---|---|---|---|
| **APTOS 2019** | 5-class DR grades (0 to 4) | DR Classification Training & Internal Test | `data/splits/aptos_train.csv`<br>`data/splits/aptos_val.csv`<br>`data/splits/aptos_test.csv` | Train: 2,929<br>Val: 367<br>Test: 366 |
| **IDRiD** | Pixel-level lesion masks (MA, HE, EX) | U-Net Lesion Segmentation | `data/manifests/idrid_segmentation_train.json`<br>`data/manifests/idrid_segmentation_test.json` | Train: 54<br>Test: 27 |
| **Messidor-2** | External 5-class DR & Macular Edema | **Strict Held-Out External Generalization** | `data/splits/messidor2_external.csv` | 1,748 images |

> [!IMPORTANT]
> **Zero Leakage Rule:** Messidor-2 is never used during feature selection, backbone pretraining, fine-tuning, or hyperparameter optimization. It serves exclusively for cross-dataset generalization evaluation.

---

## 2. Data Leakage Prevention Measures

1. **Patient Identifier Decoupling:** In datasets with multi-field examinations (both left and right eye per patient), both eyes are kept strictly in the same split partition to prevent patient-level identity leakage.
2. **Duplicate Image Detection:** SHA-256 image hashes were computed across all datasets to confirm no image exists in more than one partition.
3. **No IDRiD Concatenation:** Training masks and testing masks are maintained in strictly isolated directories (`A. Segmentation/1. Original Images/a. Training Set` vs `b. Testing Set`).

---

## 3. Training & Evaluation Commands

### Train EfficientNet-B0 Classifier:
```bash
python3 -u training/train_efficientnet.py \
  --data_dir datasets/aptos2019 \
  --manifest data/splits/aptos_train.csv \
  --val_manifest data/splits/aptos_val.csv \
  --epochs 8 \
  --batch_size 16 \
  --lr 3e-4 \
  --output_dir models/weights
```

### Train U-Net Lesion Segmenter:
```bash
python3 -u training/train_unet.py \
  --train_manifest data/manifests/idrid_segmentation_train.json \
  --test_manifest data/manifests/idrid_segmentation_test.json \
  --epochs 15 \
  --batch_size 4 \
  --output_path models/weights/unet_lesion.pth
```

### Calibrate Temperature:
```bash
python3 -u training/fit_temperature.py \
  --model_path models/weights/best_model.pth \
  --val_manifest data/splits/aptos_val.csv \
  --output_path models/weights/temperature.json
```

