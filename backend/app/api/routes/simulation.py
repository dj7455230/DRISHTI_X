"""
DRISHTI-X — Telemedicine Simulation API Route
GET /api/simulation/run
GET /api/simulation/scenarios
"""
import sys
import os
from typing import Annotated
from fastapi import APIRouter, Depends, Query

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../../.."))

from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/simulation", tags=["Simulation"])


@router.get("/run")
def run_simulation(
    current_user: Annotated[User, Depends(get_current_user)],
    bandwidth_kbps: float = Query(1000, description="Network bandwidth in kbps"),
    image_size_kb: float = Query(200, description="Image size in KB"),
    specialists: int = Query(2, description="Number of ophthalmologists"),
    review_time_min: float = Query(3.0, description="Minutes per case review"),
):
    """
    Run telemedicine simulation.
    Uses Simulink if available, Python analytical model otherwise.
    All results labeled: SIMULATION RESULTS
    """
    from simulink.simulink_runner import run_simulation as _run
    result = _run(
        bandwidth_kbps=bandwidth_kbps,
        image_size_kb=image_size_kb,
        specialists=specialists,
        specialist_review_time_min=review_time_min,
    )
    return result


@router.get("/scenarios")
def get_scenario_comparison(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Compare Low / Medium / High bandwidth scenarios."""
    from simulink.simulink_runner import _run_all_scenarios
    return {
        "disclaimer": "SIMULATION RESULTS — Not real-world measurements",
        "scenarios": _run_all_scenarios(
            image_kb=200, comp=0.4, review_min=3.0,
            specialists=2, hours=8.0, days=300
        ),
    }
