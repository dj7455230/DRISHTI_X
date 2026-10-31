"""
DRISHTI-X — SQLAlchemy Base + Engine
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Render PostgreSQL requires SSL. If DATABASE_URL starts with postgres://
# SQLAlchemy 1.4+ requires postgresql://. Fix that automatically.
_db_url = settings.DATABASE_URL
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)

try:
    if "sqlite" in _db_url:
        engine = create_engine(_db_url, connect_args={"check_same_thread": False})
    else:
        engine = create_engine(
            _db_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        # Test connection
        with engine.connect() as conn:
            pass
except Exception as e:
    print(f"[DB] PostgreSQL unavailable ({e}). Falling back to SQLite local dev database (retinatrust.db).")
    _sqlite_url = "sqlite:///./retinatrust.db"
    engine = create_engine(_sqlite_url, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
