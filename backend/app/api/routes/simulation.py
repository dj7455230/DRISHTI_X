"""
DRISHTI-X — Telemedicine & Network Simulation API Routes
Features 37, 38, 39:
- GET /api/simulation/network-mesh
- GET /api/simulation/bandwidth-comparison
- GET /api/simulation/specialist-workload
- GET /api/simulation/run
- GET /api/simulation/scenarios
"""
import sys
import os
from typing import Annotated
from fastapi import APIRouter, Depends, Query

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../../.."))

from app.api.deps import get_current_user
from app.models.user import User
from ai.simulation.rural_network_simulation import (
    run_bandwidth_comparison as _run_bw_comp,
    run_specialist_workload_simulation as _run_workload_sim,
    run_rural_network_mesh as _run_mesh_sim,
)

router = APIRouter(prefix="/api/simulation", tags=["Simulation"])


@router.get("/bandwidth-comparison")
def get_bandwidth_comparison(
    current_user: Annotated[User, Depends(get_current_user)],
    num_cases: int = Query(100, ge=10, le=500, description="Number of cases to simulate"),
    bandwidth_kbps: float = Query(128.0, ge=16.0, le=50000.0, description="Link bandwidth in kbps"),
    latency_ms: float = Query(250.0, ge=10.0, le=2000.0, description="Network latency in ms"),
    uptime_pct: float = Query(85.0, ge=10.0, le=100.0, description="Network uptime percentage"),
    image_size_kb: float = Query(1200.0, ge=100.0, le=10000.0, description="Full image size in KB"),
    capsule_size_kb: float = Query(3.2, ge=0.5, le=50.0, description="Evidence capsule size in KB"),
    random_seed: int = Query(42, description="Deterministic PRNG seed"),
):
    """
    Feature 38: FIFO vs DRISHTI-X Priority-Aware Sync comparison.
    Simulates identical case arrivals and conditions.
    """
    return _run_bw_comp(
        num_cases=num_cases,
        bandwidth_kbps=bandwidth_kbps,
        latency_ms=latency_ms,
        uptime_pct=uptime_pct,
        image_size_kb=image_size_kb,
        capsule_size_kb=capsule_size_kb,
        random_seed=random_seed,
    )


@router.get("/specialist-workload")
def get_specialist_workload(
    current_user: Annotated[User, Depends(get_current_user)],
    num_cases: int = Query(500, ge=50, le=2000, description="Total cases screened"),
    specialists: int = Query(3, ge=1, le=20, description="Available ophthalmologists"),
    hours_per_day: float = Query(8.0, ge=1.0, le=16.0, description="Operating hours per shift"),
    avg_review_time_min: float = Query(3.5, ge=0.5, le=30.0, description="Avg review time per case in min"),
    referral_triage_mode: str = Query("BALANCED", description="Triage mode: CONSERVATIVE, BALANCED, AGGRESSIVE"),
    random_seed: int = Query(42, description="Deterministic PRNG seed"),
):
    """
    Feature 39: Specialist Workload & Queuing Theory Simulation.
    Evaluates queuing delays, review volumes, and specialist burnout risk.
    """
    return _run_workload_sim(
        num_cases=num_cases,
        specialists=specialists,
        hours_per_day=hours_per_day,
        avg_review_time_min=avg_review_time_min,
        referral_triage_mode=referral_triage_mode,
        random_seed=random_seed,
    )


@router.get("/network-mesh")
def get_network_mesh(
    current_user: Annotated[User, Depends(get_current_user)],
    specialists: int = Query(3, ge=1, le=20, description="Available ophthalmologists"),
    hours_per_day: float = Query(8.0, ge=1.0, le=16.0, description="Hours per day"),
    random_seed: int = Query(42, description="Deterministic PRNG seed"),
):
    """
    Feature 37: Multi-node rural PHC telemedicine simulation.
    """
    return _run_mesh_sim(
        specialists=specialists,
        hours_per_day=hours_per_day,
        random_seed=random_seed,
    )


@router.get("/run")
def run_simulation(
    current_user: Annotated[User, Depends(get_current_user)],
    bandwidth_kbps: float = Query(1000, description="Network bandwidth in kbps"),
    image_size_kb: float = Query(200, description="Image size in KB"),
    specialists: int = Query(2, description="Number of ophthalmologists"),
    review_time_min: float = Query(3.0, description="Minutes per case review"),
):
    """
    Run legacy telemedicine simulation.
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
