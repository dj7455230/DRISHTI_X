"""
DRISHTI-X — MATLAB Engine Diagnostics and Connection Endpoints
Feature 28 Implementation.
"""
from typing import Annotated, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.models.user import User
from app.api.deps import get_current_user
from ai.matlab_engine.matlab_adapter import MatlabAdapter

router = APIRouter(prefix="/api/engine/matlab", tags=["MATLAB Engine"])


@router.get("/status")
def get_matlab_status(
    current_user: Annotated[User, Depends(get_current_user)],
) -> Dict[str, Any]:
    """
    Feature 28: Diagnostic endpoint for MATLAB Engine availability.
    Reports real detection, Python runtime compatibility, available .m scripts,
    and active fallback engine without mock predictions or leaked credentials.
    """
    adapter = MatlabAdapter()
    return adapter.check_matlab_availability()


@router.post("/test-connection")
def test_matlab_connection(
    current_user: Annotated[User, Depends(get_current_user)],
) -> Dict[str, Any]:
    """
    Feature 28: Live connection test to MATLAB Engine API for Python.
    Safely tests initialization and provides transparent diagnostics.
    """
    adapter = MatlabAdapter()
    status = adapter.connect()
    return {
        "connected": status.get("success", False),
        "status": status.get("connection_status", "NOT_CONFIGURED"),
        "diagnostic_details": status,
        "active_engine": "PYTHON_EFFICIENTNET" if not status.get("success") else "MATLAB_ENGINE",
        "notice": "Autonomous diagnosis disabled. Results require licensed ophthalmologist review.",
    }

