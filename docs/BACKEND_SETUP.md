# DRISHTI-X — Backend Architecture & Developer Setup Guide

This document details the configuration, architecture, startup lifecycle, and service dependencies for the **DRISHTI-X** FastAPI application server.

---

## 1. Backend Architecture

The backend is organized into a modular layered architecture ensuring clean separation of concerns:

```
backend/
├── app/
│   ├── main.py                  # Application entry point, lifespan, CORS, middleware, static mounts
│   ├── core/
│   │   ├── config.py            # Pydantic BaseSettings, environment variable parsing & validation
│   │   └── security.py          # Passlib password hashing, JWT encoding/decoding, role verification
│   ├── db/
│   │   ├── base.py              # SQLAlchemy engine initialization, PostgreSQL & SQLite fallback
│   │   └── seed_users.py        # Seed clinical and test administrative accounts
│   ├── models/
│   │   ├── user.py              # User entity, UserRole enum (ADMIN, OPHTHALMOLOGIST, HEALTH_WORKER)
│   │   ├── patient.py           # Patient demographics, diabetes profile, clinical history
│   │   ├── screening.py         # Screening, FundusImage, Prediction, DoctorReview, Referral, Reports
│   │   └── audit.py             # Tamper-evident SHA-256 audit log blockchain
│   ├── schemas/
│   │   ├── user.py              # User create, login, token, and profile schemas
│   │   ├── patient.py           # Patient create, update, and search schemas
│   │   └── screening.py         # Screening intake, image upload, quality, and review schemas
│   ├── api/
│   │   ├── deps.py              # Dependency injection: get_db, get_current_user, role guards
│   │   └── routes/
│   │       ├── auth.py          # /api/auth: login, registration, Google OAuth, me
│   │       ├── patients.py      # /api/patients: CRUD, duplicate detection, history comparison
│   │       ├── screenings.py    # /api/screenings: atomic intake, upload, quality, inference
│   │       ├── dashboard.py     # /api/dashboard: triage statistics, analytics overview
│   │       ├── referrals.py     # /api/referrals: priority referral queue management
│   │       ├── reports.py       # /api/reports: 17-section PDF screening report generation
│   │       ├── simulation.py    # /api/simulation: rural network mesh simulation
│   │       ├── admin.py         # /api/admin: tamper-evident audit ledger, judge reset
│   │       ├── matlab.py        # /api/engine/matlab: MATLAB diagnostics & status
│   │       └── evaluation.py    # /api/evaluation: cross-dataset generalization metrics
│   └── services/
│       ├── pdf_report_service.py   # ReportLab PDF compilation
│       ├── google_auth.py          # Official Google ID token verification
│       ├── priority_sync_service.py # Low-bandwidth rural priority batch synchronization
│       ├── audit_service.py        # Cryptographic audit hash-chain calculation
│       └── dataset_service.py      # APTOS, IDRiD, Messidor-2 dataset inventory
├── requirements.txt             # Python dependencies
└── start.sh                     # Terminal startup script
```

---

## 2. Prerequisites & Environment Setup

### Verified Python Environment
- **Python Version:** Python 3.10 to 3.14 (Verified on Python 3.14.2)
- **Virtual Environment Setup:**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

---

## 3. Configuration & Startup Commands

### Environment File (`.env`)
Ensure `.env` in the project root contains:
```ini
APP_ENV=development
DEBUG=True
SECRET_KEY=your-secure-secret-key-at-least-32-chars
DATABASE_URL=postgresql://postgres:062006@localhost:5432/drishti_x
MODEL_DIR=models/weights
MODEL_STATUS=TRAINED
DEMO_MODE=False
UPLOAD_DIR=uploads
REPORTS_DIR=reports
GOOGLE_CLIENT_ID=433805525665-1k3toag11rt3n98csf523r96rro1j39r.apps.googleusercontent.com
```

### Exact Backend Startup Command
```bash
python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 4. Health Check Verification

- **Service Registry (`GET /`):**
  ```bash
  curl -s http://localhost:8000/
  ```
- **Deep Health Check (`GET /health` or `GET /api/health`):**
  ```bash
  curl -s http://localhost:8000/api/health
  ```
- **Interactive Documentation:**
  - Swagger UI: `http://localhost:8000/docs` (or `/api/docs`)
  - ReDoc: `http://localhost:8000/redoc`

