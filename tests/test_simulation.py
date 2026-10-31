"""
DRISHTI-X — Tests: Simulink/Analytical Simulation
"""
import sys, os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from simulink.simulink_runner import run_python_analytical_simulation


def test_simulation_returns_required_keys():
    r = run_python_analytical_simulation(bandwidth_kbps=1000)
    assert "results" in r
    assert "disclaimer" in r
    assert "simulation_engine" in r
    res = r["results"]
    for key in ["patients_per_year", "avg_upload_time_ms", "specialist_utilization_pct",
                "avg_queue_length", "bandwidth_utilization_pct"]:
        assert key in res, f"Missing: {key}"


def test_high_bandwidth_more_patients():
    low  = run_python_analytical_simulation(bandwidth_kbps=64)
    high = run_python_analytical_simulation(bandwidth_kbps=10000)
    # Upload time should be much shorter on high bandwidth
    assert high["results"]["avg_upload_time_ms"] < low["results"]["avg_upload_time_ms"]


def test_patients_per_year_positive():
    r = run_python_analytical_simulation()
    assert r["results"]["patients_per_year"] > 0


def test_disclaimer_present():
    r = run_python_analytical_simulation()
    assert "SIMULATION RESULTS" in r["disclaimer"]


def test_scenarios_present():
    r = run_python_analytical_simulation()
    assert "scenarios" in r
    scenarios = r["scenarios"]
    assert "low_bandwidth_2g" in scenarios
    assert "medium_bandwidth_3g" in scenarios
    assert "high_bandwidth_4g" in scenarios


def test_utilization_in_range():
    r = run_python_analytical_simulation()
    u = r["results"]["specialist_utilization_pct"]
    assert 0 <= u <= 100
