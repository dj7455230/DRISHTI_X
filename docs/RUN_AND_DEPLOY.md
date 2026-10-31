# DRISHTI-X — RUN AND DEPLOYMENT GUIDE
**AI-Assisted Retinal Microvasculature Diagnostics Platform**  
**Version:** 1.0.0 (SIH 2026 Edition)  

---

## 1. System Requirements

- **Operating System:** macOS (Apple Silicon / Intel), Linux (Ubuntu 20.04+), or Windows (WSL2 recommended)
- **Python:** Python 3.10, 3.11, 3.12, 3.13, or 3.14
- **Node.js:** Node.js v18.x, v20.x, or v22.x with npm
- **GPU (Optional):** CUDA-capable GPU for faster PyTorch training/inference (CPU inference runs in ~250–500ms on modern CPUs)
- **Database:** SQLite (default local zero-configuration dev database: `retinatrust.db`) or PostgreSQL 14+

---

## 2. Directory Structure

```
aictr/
├── backend/                  # FastAPI Application Core
│   ├── app/
│   │   ├── api/routes/       # Endpoints: auth, patients, screenings, reports, referrals, dashboard
│   │   ├── core/             # Configuration & security (JWT, bcrypt)
│   │   ├── db/               # SQLAlchemy engine (Postgres + SQLite fallback)
│   │   ├── models/           # Relational ORM models
│   │   ├── schemas/          # Pydantic validation schemas
│   │   └── services/         # PDF generator (ReportLab), Google auth, reports
│   └── requirements.txt
├── frontend/                 # Next.js 16.3 + React 19 App Router
│   ├── app/                  # Routes: /dashboard, /analysis, /eye-explorer, /screenings, /patients, etc.
│   ├── components/           # Eye3DViewer (Three.js/R3F), GradCamViewer, LesionViewer, Sidebar
│   ├── lib/                  # Typed API client, Zustand stores, offline queue
│   └── package.json
├── ai/                       # AI/ML Inference & Explainability Engines
│   ├── classification/       # EfficientNet-B0 model & temperature calibration
│   ├── segmentation/         # U-Net lesion segmentation engine
│   ├── explainability/       # Backpropagation hook Grad-CAM
│   ├── quality/              # Laplacian focus & illumination quality gate
│   └── inference/            # 6-step unified inference orchestrator
├── models/weights/           # Real PyTorch Weights
│   ├── best_model.pth        # Trained DR classifier (16.4 MB)
│   ├── unet_lesion.pth       # Trained U-Net lesion segmenter (31.1 MB)
│   └── temperature.json      # Fitted temperature calibration (T = 1.604)
├── reports/                  # Generated JSON & ReportLab PDF screening reports
├── uploads/                  # Uploaded fundus images, heatmaps, and lesion masks
└── tests/                    # 123 PyTest automated test suite
```

---

## 3. Quick Start (One Command)

On macOS / Linux:
```bash
bash start.sh
```
This script checks weights and `.env`, launching the FastAPI backend on port 8000 and the Next.js frontend on port 3000 in separate tabs.

---

## 4. Manual Step-by-Step Execution

### Step 1: Configure Environment Variables

The project includes pre-configured `.env` and `backend/.env` files. Verify that `.env` contains:
```ini
APP_ENV=development
DEBUG=True
SECRET_KEY=drishti_x_dev_secret_change_in_production_abc123
DATABASE_URL=postgresql://postgres:062006@localhost:5432/drishti_x
MODEL_DIR=models/weights
MODEL_STATUS=TRAINED
DEMO_MODE=False
MATLAB_AVAILABLE=False
UPLOAD_DIR=uploads
```
*Note: If PostgreSQL is not active locally, the backend automatically and seamlessly falls back to the embedded SQLite database (`retinatrust.db`).*

### Step 2: Start the FastAPI Backend

From the project root:
```bash
export PYTHONPATH="$(pwd)/backend:$(pwd)"
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --app-dir backend
```

Verify backend health:
- Health Endpoint: `http://localhost:8000/api/health`
- Interactive Swagger Documentation: `http://localhost:8000/api/docs`
- ReDoc Documentation: `http://localhost:8000/api/redoc`

### Step 3: Start the Next.js Frontend

In a separate terminal:
```bash
cd frontend
npm run dev
```

Open your browser to:
```
http://localhost:3000
```

---

## 5. Default Demonstration Credentials

The local database is seeded with practitioner credentials for immediate demonstration:

- **Role:** Certified Ophthalmologist
- **Email:** `testdoc@example.com`
- **Password:** `doctor123`

You may also register a new practitioner or health-worker account instantly at:
```
http://localhost:3000/register
```

---

## 6. Verification & Automated Testing Commands

### Backend Automated Test Suite (123 Tests)
```bash
pytest tests/
```
*Expected result:* `123 passed in ~38s`. Covers APIs, PyTorch models, temperature calibration, Grad-CAM hooks, U-Net lesion candidate extraction, quality gates, and report generation.

### Frontend Production Build Check
```bash
npm --prefix frontend run build
```
*Expected result:* Compiles all 19 App Router static and dynamic pages with zero errors.

### Frontend ESLint Code Quality Check
```bash
npm --prefix frontend run lint
```
*Expected result:* `0 errors`.

---

## 7. Production Deployment Options

### A. Docker Containerization
Dockerfiles are included for both services:
```bash
# Build & run backend container
docker build -t drishti-x-backend -f docker/Dockerfile.backend .
docker run -p 8000:8000 drishti-x-backend

# Build & run frontend container
docker build -t drishti-x-frontend -f docker/Dockerfile.frontend frontend/
docker run -p 3000:3000 drishti-x-frontend
```

### B. Cloud Deployment (Render & Vercel)
- **Backend on Render:** Configured via `render.yaml`. Connect your GitHub repository to deploy the FastAPI application with persistent disk storage for weights and uploads.
- **Frontend on Vercel:** Deploy the `frontend/` directory with `NEXT_PUBLIC_API_URL` pointing to your deployed backend URL.

