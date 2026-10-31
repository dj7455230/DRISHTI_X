"""
DRISHTI-X — Core Configuration
Loads from environment variables / .env file.

Production (Render): set all variables as Render environment variables.
Local development: values are read from backend/.env or .env in project root.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Optional
import os
from pathlib import Path

# Resolve .env file paths robustly regardless of working directory.
# When running from project root: backend/.env resolves correctly.
# When running from inside backend/: .env resolves correctly.
_here = Path(__file__).resolve().parent           # backend/app/core/
_backend_dir = _here.parent.parent                # backend/
_project_root = _backend_dir.parent              # drishti-x-backup/

_env_files = []
for candidate in [
    _backend_dir / ".env",         # backend/.env  (local dev, run from root)
    _project_root / ".env",        # project root .env
    Path(".env"),                  # current working dir .env (Render)
]:
    if candidate.exists():
        _env_files.append(str(candidate))

if not _env_files:
    _env_files = [".env"]  # fallback — will be silently ignored if missing


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_files,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )
    APP_NAME: str = "DRISHTI-X"
    APP_VERSION: str = "0.1.0"
    APP_ENV: str = "development"          # development | production | demo
    DEBUG: bool = False

    # Security — MUST be set as environment variable in production
    SECRET_KEY: str = "CHANGE_THIS_IN_PRODUCTION_USE_openssl_rand_hex_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 hours

    # Google OAuth 2.0 / Identity Services
    GOOGLE_CLIENT_ID: Optional[str] = None

    @field_validator("GOOGLE_CLIENT_ID", mode="before")
    @classmethod
    def clean_google_client_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip().strip("'\"")
        return cleaned if cleaned else None

    # Database — set DATABASE_URL as Render environment variable
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/drishti_x"

    # CORS — set FRONTEND_URL in production to your deployed frontend URL
    # e.g. https://drishti-x.vercel.app
    FRONTEND_URL: str = "http://localhost:3000"

    # File Storage — on Render use /tmp or external storage (see docs)
    UPLOAD_DIR: str = "uploads"
    REPORTS_DIR: str = "reports"
    MAX_IMAGE_SIZE_MB: int = 20
    ALLOWED_IMAGE_EXTENSIONS: List[str] = [".jpg", ".jpeg", ".png", ".tiff", ".bmp"]

    # Model — MODEL_DIR is relative to project root (one level above backend/)
    # On Render: set MODEL_DIR=/opt/render/project/src/models/weights
    # or mount model files and set the path here.
    MODEL_DIR: str = "models/weights"
    MODEL_STATUS: str = "NOT_TRAINED"   # NOT_TRAINED | TRAINED | VALIDATED | DEMO
    DEMO_MODE: bool = True               # Overridden once model loads successfully

    # MATLAB
    MATLAB_AVAILABLE: bool = False
    MATLAB_ENGINE_PATH: str = ""

    # AI Pipeline
    DEVICE: str = "cpu"                  # cpu | cuda | mps
    BATCH_SIZE: int = 8
    IMAGE_SIZE: int = 224
    NUM_CLASSES: int = 5                 # DR Grade 0-4

    # Thresholds
    MIN_QUALITY_SCORE: float = 0.5       # Below this → RECAPTURE REQUIRED
    MIN_CONFIDENCE_FOR_VALIDATION: float = 0.75
    MISMATCH_THRESHOLD: float = 0.3      # Evidence vs prediction divergence

    # Referral
    REFERABLE_GRADES: List[int] = [2, 3, 4]  # Grade 2+ = Referable DR

    @property
    def model_weights_path(self) -> str:
        """Resolve MODEL_DIR relative to project root if it's a relative path."""
        if os.path.isabs(self.MODEL_DIR):
            return self.MODEL_DIR
        # Try resolving relative to project root (one level above backend/)
        project_root = Path(__file__).resolve().parent.parent.parent.parent
        candidate = project_root / self.MODEL_DIR
        if candidate.exists():
            return str(candidate)
        # Fallback: relative to cwd (works when running from project root)
        return self.MODEL_DIR


settings = Settings()
