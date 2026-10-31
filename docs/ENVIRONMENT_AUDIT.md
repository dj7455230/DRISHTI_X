# DRISHTI-X | Environment & Hardware Audit Report

**Audit Date:** 2026-10-31  
**Hardware Platform:** Apple Silicon M4 (16.00 GB Unified Memory)  
**Operating System:** macOS Darwin (arm64, macOS 26.5.2)  

---

## 1. Hardware Specifications

| Component | Specification | Operational Status |
|---|---|---|
| **Processor** | Apple Silicon M4 | Active (High-performance neural/vector engines) |
| **Architecture** | ARM64 (`arm64-arm-64bit-Mach-O`) | Native |
| **Total RAM** | 16.00 GB Unified Memory | Verified |
| **Available RAM** | ~5.94 GB Available (dynamic paging) | Sufficient for batch size 16–32 |
| **Storage Total** | 228.27 GB NVMe SSD | Verified |
| **Available Disk Space** | 14.08 GB Free | Requires on-the-fly transforms & lean checkpoints |
| **GPU / Acceleration** | Apple Metal Performance Shaders (MPS) | Available & Built (`torch.backends.mps.is_available() == True`) |

---

## 2. Software & Toolchain Stack

### Python Runtime
- **Version:** Python 3.14.2 (`v3.14.2:df793163d58`, Clang 16.0.0)
- **PyTorch Version:** 2.12.0
- **TorchVision Version:** 0.17+ compatible
- **MPS Device Probe:**
  ```python
  import torch
  device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
  # Result: device(type='mps', index=0)
  ```

### JavaScript / Node.js Runtime
- **Node.js Version:** v24.15.0
- **npm Version:** 11.12.1
- **Next.js Version:** 16.3.4 (with React 19)
- **Three.js Stack:** `three@0.174.0`, `@react-three/fiber@9.0.4`, `@react-three/drei@10.0.7`

---

## 3. Python Environment & Library Audit

All essential medical imaging and deep learning dependencies are installed and verified:

| Package | Status | Role |
|---|---|---|
| `torch` (2.12.0) | Installed | Neural network training & inference |
| `torchvision` | Installed | Standard transforms & ImageNet backbone weights |
| `timm` | Installed | PyTorch Image Models library |
| `opencv-python` (cv2) | Installed | Fast image reading, CLAHE, resizing, morphological ops |
| `scikit-learn` | Installed | Stratified split generation, QWK, ROC-AUC, classification metrics |
| `pandas` & `numpy` | Installed | Tabular data manipulation & matrix computations |
| `fastapi` & `uvicorn` | Installed | Asynchronous REST API service |
| `sqlalchemy` | Installed | Relational database ORM (SQLite / PostgreSQL) |
| `reportlab` | Installed | Automated PDF medical report compilation |
| `pydantic` | Installed | Request/response schema validation |

---

## 4. Resource Constraints & Mitigation Strategies

### Disk Space Management
- **Constraint:** ~14.08 GB free disk space.
- **Mitigation:**
  - Avoid creating duplicate uncompressed raw image folders on disk.
  - Utilize PyTorch `Dataset` with on-the-fly preprocessing (circular cropping, CLAHE, normalization).
  - Save only the best and final model checkpoints (`best_model.pth`, `best_unet.pth`) along with compact evaluation JSONs and confusion matrices.
  - Keep test manifests in lightweight CSV/JSON format.

### Memory & MPS Optimization
- **Constraint:** Unified memory shared between CPU and GPU.
- **Mitigation:**
  - Set batch size to 16 for EfficientNet-B0 (224x224) and 8 for U-Net (512x512).
  - Explicitly clear MPS cache (`torch.mps.empty_cache()`) between training epochs and evaluation routines.
  - Implement graceful fallback to CPU in the event of unsupported MPS operators.

