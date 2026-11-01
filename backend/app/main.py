"""
DRISHTI-X — FastAPI Application Entry Point
See the Evidence. Explain the Risk. Connect Rural India.
"""
import sys
import os
import secrets
import string
from pathlib import Path
from datetime import datetime, timezone
from contextlib import asynccontextmanager

# ----------------------------------------------------------------
# Robust sys.path bootstrapping
# Ensures both backend/ and project root are always on sys.path
# regardless of whether started via uvicorn backend.app.main:app,
# uvicorn app.main:app --app-dir backend, or direct python execution.
# ----------------------------------------------------------------
_file_dir = Path(__file__).resolve().parent          # backend/app
_backend_dir = _file_dir.parent                      # backend
_project_root = _backend_dir.parent                 # project root

for _p in [str(_backend_dir), str(_project_root)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from fastapi import FastAPI
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.db.base import Base, engine
from app.api.routes import auth, patients, screenings, dashboard
from app.api.routes import simulation, reports, referrals, admin, matlab, evaluation

# ----------------------------------------------------------------
# Startup / Shutdown
# ----------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (use Alembic migrations in production)
    Base.metadata.create_all(bind=engine)

    # Ensure existing users and doctor_reviews tables have updated columns (safe for PostgreSQL and SQLite)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        is_sqlite = engine.dialect.name == "sqlite"
        bool_pat_col = "BOOLEAN DEFAULT 0 NULL" if is_sqlite else "BOOLEAN DEFAULT FALSE"

        with engine.begin() as conn:
            if "users" in tables:
                existing_cols = {c["name"] for c in inspector.get_columns("users")}
                if "google_id" not in existing_cols:
                    try:
                        conn.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL"))
                        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id)"))
                    except Exception:
                        pass
                if "auth_provider" not in existing_cols:
                    try:
                        conn.execute(text("ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50) DEFAULT 'local' NOT NULL"))
                    except Exception:
                        pass
                if "avatar_url" not in existing_cols:
                    try:
                        conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(1024) NULL"))
                    except Exception:
                        pass
            if "doctor_reviews" in tables:
                dr_cols = {c["name"] for c in inspector.get_columns("doctor_reviews")}
                if "heatmap_usefulness" not in dr_cols:
                    try:
                        conn.execute(text("ALTER TABLE doctor_reviews ADD COLUMN heatmap_usefulness VARCHAR(50) NULL"))
                    except Exception:
                        pass
                if "quality_assessment_agreed" not in dr_cols:
                    try:
                        conn.execute(text("ALTER TABLE doctor_reviews ADD COLUMN quality_assessment_agreed BOOLEAN NULL"))
                    except Exception:
                        pass
                if "disagreement_reasons" not in dr_cols:
                    try:
                        conn.execute(text("ALTER TABLE doctor_reviews ADD COLUMN disagreement_reasons JSON NULL"))
                    except Exception:
                        pass
                if "recapture_reason" not in dr_cols:
                    try:
                        conn.execute(text("ALTER TABLE doctor_reviews ADD COLUMN recapture_reason TEXT NULL"))
                    except Exception:
                        pass
            if "patients" in tables:
                pat_cols = {c["name"] for c in inspector.get_columns("patients")}
                patient_additions = [
                    ("name", "VARCHAR(200) NULL"),
                    ("date_of_birth", "DATE NULL"),
                    ("contact_number", "VARCHAR(50) NULL"),
                    ("address", "TEXT NULL"),
                    ("is_anonymous", bool_pat_col),
                    ("diabetes_type", "VARCHAR(50) NULL"),
                    ("diabetes_treatment", "VARCHAR(100) NULL"),
                    ("hba1c_value", "FLOAT NULL"),
                    ("hba1c_unit", "VARCHAR(20) DEFAULT '%' NULL"),
                    ("hba1c_date", "DATE NULL"),
                    ("blood_glucose_value", "FLOAT NULL"),
                    ("blood_glucose_unit", "VARCHAR(20) DEFAULT 'mg/dL' NULL"),
                    ("blood_glucose_type", "VARCHAR(50) NULL"),
                    ("history_of_dr", "VARCHAR(100) NULL"),
                    ("last_retinal_exam_date", "DATE NULL"),
                    ("previous_eye_treatment", "TEXT NULL"),
                    ("relevant_eye_conditions", "TEXT NULL"),
                    ("visual_symptoms", "JSON NULL"),
                    ("symptom_onset", "VARCHAR(100) NULL"),
                    ("pregnancy_status", "VARCHAR(50) NULL"),
                    ("pin_code", "VARCHAR(20) NULL"),
                    ("preferred_language", "VARCHAR(50) DEFAULT 'HINDI' NULL"),
                    ("diabetes_status", "VARCHAR(50) NULL"),
                    ("blood_pressure", "VARCHAR(50) NULL"),
                    ("relevant_medications", "TEXT NULL"),
                    ("clinical_history", "JSON NULL"),
                ]
                for col_name, col_type in patient_additions:
                    if col_name not in pat_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE patients ADD COLUMN {col_name} {col_type}"))
                        except Exception as col_err:
                            print(f"[Startup] Migration note for patients.{col_name}: {col_err}")
            if "screenings" in tables:
                scr_cols = {c["name"] for c in inspector.get_columns("screenings")}
                screening_additions = [
                    ("eye_side", "VARCHAR(10) DEFAULT 'RIGHT' NULL"),
                    ("screening_purpose", "VARCHAR(100) DEFAULT 'ROUTINE_DR_SCREENING' NULL"),
                    ("screening_notes", "TEXT NULL"),
                    ("referral_source", "VARCHAR(100) NULL"),
                    ("referring_doctor", "VARCHAR(200) NULL"),
                    ("consent_status", "VARCHAR(50) DEFAULT 'CONSENT_OBTAINED' NULL"),
                    ("facility_name", "VARCHAR(200) NULL"),
                    ("operator_name", "VARCHAR(200) NULL"),
                    ("clinical_context", "JSON NULL"),
                    ("priority_level", "VARCHAR(20) DEFAULT 'ROUTINE' NULL"),
                    ("priority_score", "FLOAT DEFAULT 0.0 NULL"),
                    ("priority_factors", "JSON NULL"),
                    ("priority_rule_version", "VARCHAR(20) DEFAULT '1.0.0' NULL"),
                    ("priority_calculated_at", "TIMESTAMP NULL"),
                    ("case_number", "VARCHAR(50) NULL"),
                    ("capsule_synced", bool_pat_col),
                    ("full_image_pending", bool_pat_col),
                    ("sync_idempotency_key", "VARCHAR(128) NULL"),
                ]
                for col_name, col_type in screening_additions:
                    if col_name not in scr_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE screenings ADD COLUMN {col_name} {col_type}"))
                        except Exception as col_err:
                            print(f"[Startup] Migration note for screenings.{col_name}: {col_err}")
            if "audit_logs" in tables:
                audit_cols = {c["name"] for c in inspector.get_columns("audit_logs")}
                for col_name, col_type in [("prev_event_hash", "VARCHAR(64) NULL"), ("event_hash", "VARCHAR(64) NULL")]:
                    if col_name not in audit_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE audit_logs ADD COLUMN {col_name} {col_type}"))
                        except Exception as col_err:
                            print(f"[Startup] Migration note for audit_logs.{col_name}: {col_err}")

            # Auto-backfill case numbers for existing screenings where null
            if "screenings" in tables:
                try:
                    null_cases = conn.execute(text("SELECT id FROM screenings WHERE case_number IS NULL")).fetchall()
                    for rec in null_cases:
                        sid_str = str(rec[0])
                        now_str = datetime.now(timezone.utc).strftime("%Y%m")
                        sfx = sid_str.replace("-", "")[:6].upper()
                        cnum = f"DX-CASE-{now_str}-{sfx}"
                        conn.execute(
                            text("UPDATE screenings SET case_number = :cnum WHERE id = :sid"),
                            {"cnum": cnum, "sid": rec[0]}
                        )
                except Exception as bf_err:
                    print(f"[Startup] Case number backfill note: {bf_err}")
    except Exception as e:
        print(f"[Startup] DB schema check note: {e}")

    # Ensure upload/reports directories exist (works for both /tmp and local paths)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.REPORTS_DIR, exist_ok=True)
    os.makedirs(settings.model_weights_path, exist_ok=True)

    # Pre-load model at startup so health endpoint is accurate immediately
    weights_path = os.path.join(settings.model_weights_path, "best_model.pth")
    try:
        from ai.classification.model import get_model_loader
        loader = get_model_loader(
            weights_path=weights_path if os.path.exists(weights_path) else None
        )
        actual_status = loader.status
        is_demo = not loader.is_ready_for_real_inference()
    except Exception as e:
        actual_status = "NOT_TRAINED"
        is_demo = True
        print(f"[Startup] Model loader warning: {e}")

    print("=" * 60)
    print(f"  DRISHTI-X v{settings.APP_VERSION}")
    print(f"  Environment: {settings.APP_ENV}")
    print(f"  Model Status: {actual_status}")
    print(f"  Demo Mode:    {is_demo}")
    if is_demo:
        print("  ⚠  DEMO MODE ACTIVE — No trained model loaded")
    else:
        print("  ✓  REAL MODEL ACTIVE — EfficientNet-B0 trained weights loaded")
    if not settings.MATLAB_AVAILABLE:
        print("  ℹ  MATLAB ENGINE UNAVAILABLE — Python fallback active")
    print("=" * 60)

    yield


# ----------------------------------------------------------------
# Application
# ----------------------------------------------------------------
app = FastAPI(
    title="DRISHTI-X API",
    description=(
        "Explainable AI for Diabetic Retinopathy Screening in Rural India. "
        "AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS."
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ----------------------------------------------------------------
# CORS — configurable via FRONTEND_URL environment variable
# Production: set FRONTEND_URL=https://your-frontend.vercel.app
# ----------------------------------------------------------------
raw_origins = [
    settings.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
if "," in settings.FRONTEND_URL:
    raw_origins.extend(settings.FRONTEND_URL.split(","))

# Normalize origins: strip whitespace and trailing slashes
allowed_origins = list({o.strip().rstrip("/") for o in raw_origins if o and o.strip()})

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------
# Static Files (uploaded images, Grad-CAMs, etc.)
# Directory is created at startup in lifespan; also ensure here.
# ----------------------------------------------------------------
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ----------------------------------------------------------------
# Routes
# ----------------------------------------------------------------
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(screenings.router)
app.include_router(dashboard.router)
app.include_router(simulation.router)
app.include_router(reports.router)
app.include_router(referrals.router)
app.include_router(admin.router)
app.include_router(matlab.router)
app.include_router(evaluation.router)


# ----------------------------------------------------------------
# Feature 30: Structured Failure and Error Handling
# ----------------------------------------------------------------
def generate_error_reference() -> str:
    chars = string.ascii_uppercase + string.digits
    return "ERR-" + "".join(secrets.choice(chars) for _ in range(8))


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc: StarletteHTTPException):
    ref_id = generate_error_reference()
    detail_msg = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    error_code = f"ERR_HTTP_{exc.status_code}"
    if exc.status_code == 404:
        error_code = "ERR_RESOURCE_NOT_FOUND"
    elif exc.status_code == 401:
        error_code = "ERR_UNAUTHORIZED"
    elif exc.status_code == 403:
        error_code = "ERR_FORBIDDEN_ROLE"
    elif exc.status_code == 422:
        error_code = "ERR_UNPROCESSABLE_ENTITY"

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "error_code": error_code,
            "reference_id": ref_id,
            "message": detail_msg,
            "status_code": exc.status_code,
            "retryable": exc.status_code in [408, 429, 502, 503, 504],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        headers=getattr(exc, "headers", None)
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    ref_id = generate_error_reference()
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "error_code": "ERR_VALIDATION_FAILED",
            "reference_id": ref_id,
            "message": "Request payload validation failed.",
            "status_code": 422,
            "retryable": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


# ----------------------------------------------------------------
# Health & Status Diagnostics Helpers (Section 4)
# ----------------------------------------------------------------
def check_db_health():
    """Real query to check database connectivity."""
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "dialect": engine.dialect.name,
            "connected": True,
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "dialect": getattr(getattr(engine, "dialect", None), "name", "unknown"),
            "connected": False,
            "error": str(e),
        }


def check_ai_health():
    """Verify EfficientNet-B0 and U-Net model checkpoints."""
    weights_path = os.path.join(settings.model_weights_path, "best_model.pth")
    unet_weights_path = os.path.join(settings.model_weights_path, "unet_lesion.pth")

    weights_exist = os.path.exists(weights_path)
    unet_weights_exist = os.path.exists(unet_weights_path)

    live_model_status = settings.MODEL_STATUS
    live_demo_mode = settings.DEMO_MODE

    try:
        from ai.classification.model import _loader
        if _loader is not None:
            live_model_status = _loader.status
            live_demo_mode = not _loader.is_ready_for_real_inference()
        elif weights_exist:
            live_model_status = "TRAINED"
            live_demo_mode = False
    except Exception:
        pass

    unet_status = "NOT_TRAINED"
    try:
        if unet_weights_exist:
            import torch
            ckpt = torch.load(unet_weights_path, map_location="cpu", weights_only=False)
            unet_status = ckpt.get("status", "TRAINED")
    except Exception:
        unet_status = "TRAINED" if unet_weights_exist else "NOT_TRAINED"

    return {
        "status": "healthy" if (weights_exist or unet_weights_exist) else "degraded",
        "classifier_status": live_model_status,
        "unet_status": unet_status,
        "weights_available": weights_exist,
        "unet_weights_available": unet_weights_exist,
        "demo_mode": live_demo_mode,
    }


# ----------------------------------------------------------------
# Root & Health Check Endpoints (Section 4)
# ----------------------------------------------------------------
@app.get("/docs", include_in_schema=False)
def docs_redirect():
    return RedirectResponse(url="/api/docs")


@app.get("/redoc", include_in_schema=False)
def redoc_redirect():
    return RedirectResponse(url="/api/redoc")


@app.get("/openapi.json", include_in_schema=False)
def openapi_redirect():
    return RedirectResponse(url="/api/openapi.json")


@app.get("/")
def root_service_info():
    """
    Root API endpoint identifying DRISHTI-X backend, health, and services.
    """
    db_h = check_db_health()
    ai_h = check_ai_health()
    overall = "healthy" if db_h["connected"] else "degraded"

    return {
        "app": settings.APP_NAME,
        "description": "DRISHTI-X — AI-Assisted Retinal Microvasculature Diagnostics and Diabetic Retinopathy Screening System",
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "status": overall,
        "services": {
            "api": "healthy",
            "database": db_h["status"],
            "ai_models": ai_h["status"],
        },
        "docs_url": "/api/docs",
        "health_url": "/api/health",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health")
def root_health():
    """
    Fast health check endpoint — verifies database connectivity and returns operational status.
    """
    db_h = check_db_health()
    ai_h = check_ai_health()
    overall = "ok" if db_h["connected"] else "degraded"

    return {
        "status": overall,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": db_h["status"],
        "ai_models": ai_h["status"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/ready")
def readiness_check():
    """
    Readiness probe endpoint indicating whether the application is fully ready to serve requests.
    Distinguishes API liveness from dependency readiness.
    """
    db_h = check_db_health()
    ai_h = check_ai_health()

    is_ready = bool(db_h["connected"])

    response_payload = {
        "ready": is_ready,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "database_connected": db_h["connected"],
        "database_dialect": db_h.get("dialect", "unknown"),
        "ai_classifier_status": ai_h["classifier_status"],
        "ai_unet_status": ai_h["unet_status"],
        "demo_mode": ai_h["demo_mode"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if not is_ready:
        return JSONResponse(
            status_code=503,
            content=response_payload
        )

    return response_payload


@app.get("/api/health")
def health_check():
    """
    Comprehensive live health check endpoint:
    - Real database connectivity check
    - Real model loader & checkpoint inspection
    - Application version & environment
    """
    db_h = check_db_health()
    ai_h = check_ai_health()

    overall = "ok" if db_h["connected"] else "degraded"

    temperature_val = 1.1638
    try:
        temp_file = os.path.join(settings.model_weights_path, "temperature.json")
        if os.path.exists(temp_file):
            import json
            with open(temp_file) as f:
                t_data = json.load(f)
                temperature_val = round(float(t_data.get("temperature", 1.1638)), 4)
    except Exception:
        pass

    return {
        "status": overall,
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "database": db_h,
        "ai_services": ai_h,
        "model_status": ai_h["classifier_status"],
        "unet_status": ai_h["unet_status"],
        "temperature": temperature_val,
        "demo_mode": ai_h["demo_mode"],
        "weights_available": ai_h["weights_available"],
        "unet_weights_available": ai_h["unet_weights_available"],
        "matlab_available": settings.MATLAB_AVAILABLE,
        "disclaimer": "AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True, app_dir=str(_backend_dir))
