"""
DRISHTI-X — Simulink Telemedicine Simulation Runner
Executes rural_telemedicine_pipeline.slx via MATLAB Engine.
Falls back to a pure-Python analytical model if Simulink unavailable.

Clearly labels all outputs as SIMULATION RESULTS.
"""
import json
from typing import Dict, Any


SIMULATION_DISCLAIMER = (
    "SIMULATION RESULTS — Based on analytical/Simulink model parameters. "
    "Not measured real-world performance."
)


def _compute_single_scenario(
    bandwidth_kbps: float,
    image_size_kb: float,
    compression_ratio: float,
    specialist_review_time_min: float,
    specialists: int,
    operating_hours_per_day: float,
    working_days_per_year: int,
) -> Dict[str, Any]:
    """Core queuing-theory computation. No recursion."""
    compressed_kb = image_size_kb * compression_ratio
    upload_time_sec = (compressed_kb * 8) / bandwidth_kbps
    upload_time_ms = upload_time_sec * 1000

    reviews_per_specialist_per_hour = 60.0 / specialist_review_time_min
    reviews_per_day = specialists * reviews_per_specialist_per_hour * operating_hours_per_day
    patients_per_year = int(reviews_per_day * working_days_per_year)

    # M/D/c approximation
    arrival_rate = reviews_per_day * 0.85
    utilization = arrival_rate / reviews_per_day
    rho = utilization / max(specialists, 1)
    avg_queue = (rho ** 2) / (2 * (1 - rho)) if rho < 1 else 500.0
    avg_queue = min(avg_queue, 500)

    cases_per_hour = reviews_per_specialist_per_hour * specialists
    bandwidth_used_kbps = (cases_per_hour / 3600) * compressed_kb * 8
    bandwidth_utilization_pct = min(100, (bandwidth_used_kbps / bandwidth_kbps) * 100)

    return {
        "patients_per_year": patients_per_year,
        "avg_upload_time_ms": round(upload_time_ms, 1),
        "avg_upload_time_sec": round(upload_time_sec, 2),
        "specialist_utilization_pct": round(utilization * 100, 1),
        "avg_queue_length": round(avg_queue, 1),
        "bandwidth_utilization_pct": round(bandwidth_utilization_pct, 1),
        "compressed_image_kb": round(compressed_kb, 1),
    }


def _run_all_scenarios(
    image_kb: float, comp: float, review_min: float,
    specialists: int, hours: float, days: int
) -> Dict[str, Any]:
    """Compare Low/Medium/High bandwidth scenarios. No recursion."""
    scenarios = {
        "low_bandwidth_2g":    64,
        "medium_bandwidth_3g": 1000,
        "high_bandwidth_4g":   10000,
    }
    results = {}
    for name, bw in scenarios.items():
        res = _compute_single_scenario(
            bw, image_kb, comp, review_min, specialists, hours, days
        )
        results[name] = {
            "bandwidth_kbps": bw,
            "patients_per_year": res["patients_per_year"],
            "avg_upload_time_sec": res["avg_upload_time_sec"],
            "avg_queue_length": res["avg_queue_length"],
        }
    return results


def run_python_analytical_simulation(
    bandwidth_kbps: float = 1000,
    image_size_kb: float = 200,
    compression_ratio: float = 0.4,
    specialist_review_time_min: float = 3.0,
    specialists: int = 2,
    operating_hours_per_day: float = 8.0,
    working_days_per_year: int = 300,
) -> Dict[str, Any]:
    """
    Analytical telemedicine simulation (Python fallback when Simulink unavailable).
    Uses queuing theory (M/D/c model approximation).
    All outputs labeled SIMULATION RESULTS.
    """
    results = _compute_single_scenario(
        bandwidth_kbps, image_size_kb, compression_ratio,
        specialist_review_time_min, specialists,
        operating_hours_per_day, working_days_per_year,
    )
    return {
        "simulation_engine": "PYTHON_ANALYTICAL",
        "simulink_status": "SIMULINK NOT INSTALLED — Python analytical model used",
        "disclaimer": SIMULATION_DISCLAIMER,
        "inputs": {
            "bandwidth_kbps": bandwidth_kbps,
            "image_size_kb": image_size_kb,
            "compression_ratio": compression_ratio,
            "specialists": specialists,
            "specialist_review_time_min": specialist_review_time_min,
        },
        "results": results,
        "scenarios": _run_all_scenarios(
            image_size_kb, compression_ratio, specialist_review_time_min,
            specialists, operating_hours_per_day, working_days_per_year,
        ),
    }


def run_simulation(
    bandwidth_kbps: float = 1000,
    image_size_kb: float = 200,
    specialists: int = 2,
    specialist_review_time_min: float = 3.0,
) -> Dict[str, Any]:
    """
    Main entry point. Tries Simulink first, falls back to Python.
    Always labels output clearly.
    """
    try:
        import matlab.engine
        eng = matlab.engine.start_matlab()
        try:
            model_path = "simulink/rural_telemedicine_pipeline"
            eng.load_system(model_path, nargout=0)
            eng.set_param(model_path, "BandwidthKbps", str(bandwidth_kbps), nargout=0)
            eng.set_param(model_path, "Specialists", str(specialists), nargout=0)
            eng.sim(model_path, nargout=0)
            results = eng.workspace["SimResults"]
            results["simulation_engine"] = "SIMULINK"
            results["disclaimer"] = SIMULATION_DISCLAIMER
            return results
        except Exception as e:
            print(f"Simulink run failed: {e}. Using Python fallback.")
        finally:
            eng.quit()
    except ImportError:
        pass

    return run_python_analytical_simulation(
        bandwidth_kbps=bandwidth_kbps,
        image_size_kb=image_size_kb,
        specialists=specialists,
        specialist_review_time_min=specialist_review_time_min,
    )


if __name__ == "__main__":
    result = run_simulation()
    print(json.dumps(result, indent=2))
