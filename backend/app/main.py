"""
DRISHTI-X — FastAPI Application Entry Point
See the Evidence. Explain the Risk. Connect Rural India.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.db.base import Base, engine
from app.api.routes import auth, patients, screenings, dashboard
from app.api.routes import simulation, reports, referrals

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
                    ("facility_name", "VARCHAR(200) NULL"),
                    ("operator_name", "VARCHAR(200) NULL"),
                    ("clinical_context", "JSON NULL"),
                ]
                for col_name, col_type in screening_additions:
                    if col_name not in scr_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE screenings ADD COLUMN {col_name} {col_type}"))
                        except Exception as col_err:
                            print(f"[Startup] Migration note for screenings.{col_name}: {col_err}")
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
allowed_origins = [
    settings.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
# Also allow any additional comma-separated origins in FRONTEND_URL
if "," in settings.FRONTEND_URL:
    allowed_origins = [
        o.strip() for o in settings.FRONTEND_URL.split(",")
    ] + ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(allowed_origins)),
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


@app.get("/health")
def root_health():
    """Render health check endpoint — fast, no DB query."""
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/api/health")
def health_check():
    """Live health check — reads actual model loader status."""
    import os

    weights_path      = os.path.join(settings.model_weights_path, "best_model.pth")
    unet_weights_path = os.path.join(settings.model_weights_path, "unet_lesion.pth")
    weights_exist      = os.path.exists(weights_path)
    unet_weights_exist = os.path.exists(unet_weights_path)

    live_model_status = settings.MODEL_STATUS
    live_demo_mode    = settings.DEMO_MODE

    try:
        from ai.classification.model import _loader
        if _loader is not None:
            live_model_status = _loader.status
            live_demo_mode    = not _loader.is_ready_for_real_inference()
        elif weights_exist:
            live_model_status = "TRAINED"
            live_demo_mode    = False
    except Exception:
        pass

    # U-Net status
    unet_status = "NOT_TRAINED"
    try:
        if unet_weights_exist:
            import torch
            ckpt = torch.load(unet_weights_path, map_location="cpu", weights_only=False)
            unet_status = ckpt.get("status", "TRAINED")
    except Exception:
        unet_status = "TRAINED" if unet_weights_exist else "NOT_TRAINED"

    return {
        "status":                "ok",
        "app":                   settings.APP_NAME,
        "version":               settings.APP_VERSION,
        "model_status":          live_model_status,
        "unet_status":           unet_status,
        "demo_mode":             live_demo_mode,
        "weights_available":     weights_exist,
        "unet_weights_available": unet_weights_exist,
        "matlab_available":      settings.MATLAB_AVAILABLE,
        "disclaimer":            "AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS",
    }
