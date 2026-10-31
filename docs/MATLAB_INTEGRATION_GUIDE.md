# DRISHTI-X — MATLAB Engine Integration Guide

**Feature 28: Production-Grade MATLAB Engine Integration, Diagnostics & Fallback Policy**

---

## 1. Overview & Architectural Role

DRISHTI-X supports dual-engine inference for retinal microvasculature diagnostics and diabetic retinopathy screening:
1. **Primary Local Neural Engine (`PYTHON_EFFICIENTNET`)**: PyTorch-based EfficientNet-B0 classification, Temperature Scaling Calibration, PyTorch U-Net 4-channel lesion segmentation, and Grad-CAM explainability.
2. **MATLAB Engine (`MATLAB_ENGINE`)**: Optional secondary engine executing specialized MathWorks Image Processing Toolbox routines for vessel caliber measurement, arteriolar-to-venular ratio (AVR) calculation, and morphological lesion validation.

> [!IMPORTANT]
> **Strict Clinical Governance Rule:**
> If MATLAB is not configured or available, DRISHTI-X **explicitly displays its status as `NOT_CONFIGURED` or `DISCONNECTED`**. DRISHTI-X **never fakes or simulates MATLAB outputs**. All clinical inferences are transparently labeled with their active engine.

---

## 2. Platform & Python Version Compatibility

### MathWorks Official Python Compatibility
As of **MATLAB R2024b**, MathWorks officially provides the `matlab.engine` package for:
- Python 3.9
- Python 3.10
- Python 3.11
- Python 3.12

### Host Environment Runtime Diagnostic
- **Host Architecture:** Apple Silicon ARM64 (macOS)
- **Active Runtime:** Python 3.14.2
- **Compatibility Status:** MathWorks has not yet released precompiled binaries for Python 3.14 on Apple Silicon.
- **Active Execution Mode:** Graceful degradation active; all classification, quality gating, and lesion segmentation are handled natively by `PYTHON_EFFICIENTNET`.

---

## 3. MATLAB Installation & Configuration Guide

To enable the live MATLAB Engine on a production workstation:

### Step 1: Install Compatible Python Environment
Create a dedicated virtual environment with Python 3.11 or 3.12:
```bash
# Using conda or uv
uv venv --python 3.11 .venv-matlab
source .venv-matlab/bin/activate
```

### Step 2: Locate MATLAB Root Directory
Open MATLAB on macOS and locate the root path:
```matlab
>> matlabroot
/Applications/MATLAB_R2024b.app
```

### Step 3: Install `matlab.engine` Python Package
In the terminal, run:
```bash
cd "/Applications/MATLAB_R2024b.app/extern/engines/python"
python setup.py install
```

### Step 4: Verify Installation
```python
import matlab.engine
eng = matlab.engine.start_matlab()
print("MATLAB session successfully connected:", eng)
eng.quit()
```

---

## 4. Discovered DRISHTI-X MATLAB Scripts

The `MatlabAdapter` automatically scans the `matlab/` directory for validated diagnostic routines:
- `matlab/vessel_density.m`: Frangi vessel filtering and retinal vessel density index calculation.
- `matlab/lesion_quantification.m`: Morphological candidate verification for microaneurysms and hemorrhages.

---

## 5. API Endpoints for MATLAB Diagnostics

DRISHTI-X provides two dedicated endpoints to verify engine health without exposing internal file paths or credentials:

### 1. `GET /api/engine/matlab/status`
Returns live JSON diagnostics:
```json
{
  "connection_status": "NOT_CONFIGURED",
  "is_available": false,
  "engine_name": "MATLAB Engine API for Python",
  "active_fallback_engine": "PYTHON_EFFICIENTNET",
  "python_version": "3.14.2",
  "python_supported_by_mathworks": false,
  "host_os": "Darwin arm64",
  "scripts_found": ["vessel_density.m", "lesion_quantification.m"],
  "diagnostic_message": "MATLAB Engine API for Python is not installed. MathWorks officially supports Python 3.9–3.12; current runtime is Python 3.14.2 on Apple Silicon.",
  "setup_guide": "docs/MATLAB_INTEGRATION_GUIDE.md"
}
```

### 2. `POST /api/engine/matlab/test-connection`
Safely attempts an engine handshake and reports test results.

---

## 6. Clinical Disclaimer

> [!WARNING]
> DRISHTI-X is an AI-assisted screening decision support platform. Whether executed via `PYTHON_EFFICIENTNET` or `MATLAB_ENGINE`, all outputs constitute screening assistive data and do NOT replace independent examination by a licensed ophthalmologist.

