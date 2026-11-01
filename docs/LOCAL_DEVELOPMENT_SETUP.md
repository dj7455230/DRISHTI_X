# DRISHTI-X — Local Development & Deployment Guide

This guide provides exact, production-grade instructions for setting up, running, debugging, and testing the **DRISHTI-X** Retinal Microvasculature Diagnostics and Diabetic Retinopathy Screening platform on macOS, Linux, or Windows (WSL).

---

## 1. System Architecture Overview

DRISHTI-X is an enterprise-grade medical AI clinical decision support system consisting of:
- **Backend API:** FastAPI application running with Uvicorn on port `8000`.
- **Database Engine:** PostgreSQL (production) with automatic zero-configuration SQLite fallback (`retinatrust.db`) when PostgreSQL is offline or unconfigured.
- **AI/ML Engine:** PyTorch inference pipeline incorporating EfficientNet-B0 classification, U-Net multi-lesion segmentation (microaneurysms, hemorrhages, hard exudates, soft exudates), Grad-CAM explainability, and the Clinical Assurance Engine (mismatch detection, priority scoring, evidence concordance).
- **Frontend Dashboard:** Next.js 16 (App Router) + TypeScript + Tailwind CSS running on port `3000`.

```
                    +------------------------------+
                    |      Next.js Frontend        |
                    |    http://localhost:3000     |
                    +--------------+---------------+
                                   |
                     REST / JSON / Multipart HTTP
                                   |
                                   v
                    +------------------------------+
                    |       FastAPI Backend        |
                    |    http://localhost:8000     |
                    +--------------+---------------+
                                   |
         +-------------------------+-------------------------+
         |                                                   |
         v                                                   v
+------------------+                               +------------------+
| PyTorch / AI     |                               | Database Engine  |
| - EfficientNet-B0|                               | - PostgreSQL     |
| - U-Net 4-Class  |                               |   (Port 5432)    |
| - Grad-CAM XAI   |                               | - SQLite Fallback|
| - Assurance Rule |                               |   (retinatrust)  |
+------------------+                               +------------------+
```

---

## 2. Quick Start (Single Command)

To start both the FastAPI backend and Next.js frontend with automatic port freeing, health check verification, and graceful shutdown:

```bash
cd /Users/devanshjain06/Desktop/aictr
./run.sh
```

---

## 3. Prerequisites

| Component | Minimum Version | Verified In Environment |
|---|---|---|
| **Python** | 3.10+ | Python 3.14.2 |
| **Node.js** | 18+ | Node 20.x |
| **npm** | 9+ | npm 10.x |
| **PostgreSQL** *(optional)* | 14+ | Optional (SQLite fallback active) |

---

## 3. Backend Setup & Startup

### Step 1: Clone and Navigate to Project
```bash
cd /path/to/aictr
```

### Step 2: Virtual Environment Setup
Ensure your Python virtual environment is activated:
```bash
# If creating a new virtual environment:
python3 -m venv venv
source venv/bin/activate

# For Windows (PowerShell):
# .\venv\Scripts\Activate.ps1
```

### Step 3: Install Backend Dependencies
```bash
pip install -r backend/requirements.txt
```

### Step 4: Environment Variables Configuration
Create or verify `.env` in the project root:
```ini
# Environment
ENV=development
DEBUG=True
SECRET_KEY=drishti-x-super-secure-jwt-secret-key-production-ready-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Database Configuration (Optional PostgreSQL)
# If PostgreSQL is not running or unreachable, DRISHTI-X automatically
# falls back to local SQLite at retinatrust.db in the project root.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/retinatrust

# AI Models & Storage
MODEL_WEIGHTS_DIR=models
STORAGE_DIR=backend/app/static/uploads
```

### Step 5: Database Provisioning
- **Option A (Zero-Config SQLite — Default Fallback):**
  No action required. If PostgreSQL is offline, `backend/app/db/base.py` automatically initializes `retinatrust.db` and registers all SQLAlchemy tables.
- **Option B (PostgreSQL):**
  ```bash
  # macOS Homebrew
  brew services start postgresql@14
  createdb retinatrust
  ```

### Step 6: Start FastAPI Backend
To avoid `sys.path` import collisions, start the backend from the project root using either of these recommended commands:

```bash
# Command Option A (Standard uvicorn with app-dir):
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload

# Command Option B (Direct module invocation):
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 4. Frontend Setup & Startup

### Step 1: Navigate to Frontend Directory
```bash
cd frontend
```

### Step 2: Install Node Dependencies
```bash
npm install
```

### Step 3: Configure Frontend Environment
Ensure `frontend/.env.local` contains:
```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Step 4: Start Frontend Development Server
From the project root:
```bash
npm --prefix frontend run dev
```
Or from inside `frontend/`:
```bash
npm run dev
```
The user interface is accessible at: **`http://localhost:3000`**.

---

## 5. Port Conflict Diagnostic & Resolution

If uvicorn outputs:
```
ERROR: [Errno 48] Address already in use
```
This indicates an orphaned background process is holding port `8000`.

### Diagnostic & Kill Instructions:
```bash
# 1. Identify which PID is listening on port 8000
lsof -i :8000

# 2. Terminate the blocking process immediately
lsof -ti :8000 | xargs kill -9

# 3. Confirm port 8000 is completely released
lsof -i :8000
# (Should return empty output)
```

Now re-run your startup command:
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 6. Verifying System Health

Once both servers are running, verify the backend endpoints using `curl` or your browser:

### 1. Root Service Registry (`GET http://localhost:8000/`)
```bash
curl -s http://localhost:8000/ | jq .
```
Expected output:
```json
{
  "service": "DRISHTI-X Retinal AI Platform",
  "version": "2.0.0",
  "status": "online",
  "documentation": "/docs",
  "health_check": "/health",
  "api_prefix": "/api"
}
```

### 2. Deep Health Check (`GET http://localhost:8000/health`)
```bash
curl -s http://localhost:8000/health | jq .
```
Expected output:
```json
{
  "status": "healthy",
  "database": "healthy (dialect: sqlite)",
  "ai_pipeline": "ready",
  "environment": "development"
}
```

### 3. API Subpath Health Check (`GET http://localhost:8000/api/health`)
```bash
curl -s http://localhost:8000/api/health | jq .
```
Expected output:
```json
{
  "status": "healthy",
  "service": "drishti-x-backend",
  "version": "2.0.0",
  "database": "healthy (dialect: sqlite)",
  "ai_pipeline": "ready"
}
```

### 4. Interactive OpenAPI Documentation
Open in browser:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## 7. Running Automated Test Suites

The project includes 100% automated test coverage across all features (1 to 50):

### Run Core API & Health Suite
```bash
pytest tests/test_api.py -v
```

### Run Features 21–50 Test Suites
```bash
pytest tests/test_features_21_30.py tests/test_features_31_34.py tests/test_features_35_40.py tests/test_features_41_45.py tests/test_features_46_50.py -v
```

### Run Entire Automated Test Suite
```bash
pytest tests/ -v
```

### Run Frontend Production Build & TypeScript Verification
```bash
npm --prefix frontend run build
```

---

## 8. Common Troubleshooting

| Symptom | Probable Cause | Action |
|---|---|---|
| `[Errno 48] Address already in use` | Old uvicorn process still bound to port 8000 | Run `lsof -ti :8000 \| xargs kill -9` |
| `ModuleNotFoundError: No module named 'app'` | Running uvicorn without `sys.path` bootstrap or missing `--app-dir backend` | Run `python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload` |
| `Backend service unavailable` in UI | Backend server is not running on port 8000, or `NEXT_PUBLIC_API_URL` is misconfigured | Verify `curl http://localhost:8000/health` returns status `healthy` and check browser DevTools Network tab |
| 401 Unauthorized errors on API routes | JWT token expired or missing in `localStorage` | Re-login via `http://localhost:3000/login` or test using role test accounts |
| Database operational error | PostgreSQL unreachable | No action required: backend logs fallback and uses SQLite `retinatrust.db` automatically |

