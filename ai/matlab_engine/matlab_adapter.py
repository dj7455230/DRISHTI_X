"""
DRISHTI-X — MATLAB Engine Adapter & Integration Service
Feature 28 Implementation.

Manages connection, discovery, execution, and graceful degradation for the MATLAB Engine.
Ensures:
  1. Real detection: Never falsely claims MATLAB is connected or running when it is not.
  2. Strict engine provenance: Output results explicitly identify whether MATLAB or Python ran.
  3. No leaked credentials or sensitive internal paths to client responses.
  4. Explicit diagnostic guidance for macOS M4 / Python 3.14 compatibility.
"""
import os
import sys
import platform
import logging
import time
from typing import Dict, Any, Optional, List
from pathlib import Path

logger = logging.getLogger("drishti.matlab_adapter")

# Location of DRISHTI-X MATLAB .m scripts relative to project root
_PROJECT_ROOT = Path(__file__).parent.parent.parent
_MATLAB_DIR = _PROJECT_ROOT / "matlab"


class MatlabAdapter:
    """
    Production-grade adapter interface for MATLAB Engine API for Python.
    """

    def __init__(self, timeout_seconds: int = 30):
        self.timeout_seconds = timeout_seconds
        self.is_connected = False
        self.engine_instance = None
        self.connection_error: Optional[str] = None
        self.python_version = platform.python_version()
        self.os_info = f"{platform.system()} {platform.machine()} ({platform.platform()})"

    def check_matlab_availability(self) -> Dict[str, Any]:
        """
        Inspects whether MATLAB Engine API for Python is installed and usable.
        Returns complete diagnostic status without throwing unhandled exceptions.
        """
        available_scripts = self._discover_matlab_scripts()

        # Check for python-matlab bridge compatibility
        # MathWorks officially supports Python 3.9 - 3.12 (as of R2024b).
        major, minor = sys.version_info.major, sys.version_info.minor
        python_supported = (major == 3 and 9 <= minor <= 12)

        try:
            import matlab.engine
            engine_importable = True
        except ImportError as ie:
            engine_importable = False
            self.connection_error = (
                f"MATLAB Engine API for Python is not installed. (Error: {str(ie)}). "
                f"MathWorks officially supports Python 3.9–3.12; current runtime is Python {self.python_version} on Apple Silicon."
            )

        if not engine_importable:
            return {
                "connection_status": "NOT_CONFIGURED",
                "is_available": False,
                "engine_name": "MATLAB Engine API for Python",
                "active_fallback_engine": "PYTHON_EFFICIENTNET",
                "python_version": self.python_version,
                "python_supported_by_mathworks": python_supported,
                "host_os": self.os_info,
                "scripts_found": available_scripts,
                "diagnostic_message": self.connection_error,
                "setup_guide": "See docs/MATLAB_INTEGRATION_GUIDE.md for installation, licensing, and virtualenv configuration.",
            }

        return {
            "connection_status": "INSTALLED_NOT_CONNECTED",
            "is_available": True,
            "engine_name": "MATLAB Engine API for Python",
            "active_fallback_engine": "PYTHON_EFFICIENTNET",
            "python_version": self.python_version,
            "python_supported_by_mathworks": python_supported,
            "host_os": self.os_info,
            "scripts_found": available_scripts,
            "diagnostic_message": "MATLAB Engine library is importable. Call connect() to initialize session.",
            "setup_guide": "docs/MATLAB_INTEGRATION_GUIDE.md",
        }

    def connect(self) -> Dict[str, Any]:
        """
        Attempts to start a live MATLAB Engine session.
        """
        status = self.check_matlab_availability()
        if not status["is_available"]:
            return {
                "success": False,
                "error": status["diagnostic_message"],
                "connection_status": status["connection_status"],
            }

        try:
            import matlab.engine
            logger.info("Initializing MATLAB engine session...")
            self.engine_instance = matlab.engine.start_matlab()
            # Add scripts directory to MATLAB search path
            if _MATLAB_DIR.exists():
                self.engine_instance.addpath(str(_MATLAB_DIR), nargout=0)
                for sub in _MATLAB_DIR.iterdir():
                    if sub.is_dir() and not sub.name.startswith("."):
                        self.engine_instance.addpath(str(sub), nargout=0)

            self.is_connected = True
            self.connection_error = None
            return {
                "success": True,
                "connection_status": "CONNECTED",
                "message": "MATLAB engine connected and scripts path added.",
            }
        except Exception as ex:
            self.is_connected = False
            self.connection_error = f"Failed to start MATLAB session: {str(ex)}"
            logger.error(self.connection_error)
            return {
                "success": False,
                "connection_status": "DISCONNECTED",
                "error": "MATLAB session startup failed or timed out.",
            }

    def run_matlab_quality(self, image_path: str) -> Dict[str, Any]:
        """
        Executes drishti_quality_assessment.m via MATLAB engine.
        Returns validated schema with execution_engine='MATLAB'.
        """
        if not self.is_connected or not self.engine_instance:
            raise RuntimeError("MATLAB Engine is not connected. Use active Python quality engine.")

        start_t = time.time()
        try:
            # Calls drishti_quality_assessment(image_path) in MATLAB
            matlab_res = self.engine_instance.drishti_quality_assessment(image_path, nargout=1)
            elapsed = time.time() - start_t
            return {
                "execution_engine": "MATLAB",
                "execution_time_seconds": round(elapsed, 3),
                "quality_score": float(matlab_res.get("quality_score", 0.0)),
                "focus_score": float(matlab_res.get("focus_score", 0.0)),
                "illumination_score": float(matlab_res.get("illumination_score", 0.0)),
                "fov_score": float(matlab_res.get("fov_score", 0.0)),
                "is_gradable": bool(matlab_res.get("is_gradable", False)),
                "feedback": str(matlab_res.get("feedback", "MATLAB assessment complete")),
            }
        except Exception as e:
            logger.error(f"MATLAB quality assessment execution error: {e}")
            raise RuntimeError(f"MATLAB execution failed: {str(e)}")

    def run_matlab_preprocessing(self, image_path: str, output_path: str) -> Dict[str, Any]:
        """
        Executes drishti_preprocess.m via MATLAB engine.
        """
        if not self.is_connected or not self.engine_instance:
            raise RuntimeError("MATLAB Engine is not connected.")

        start_t = time.time()
        try:
            self.engine_instance.drishti_preprocess(image_path, output_path, nargout=0)
            elapsed = time.time() - start_t
            return {
                "execution_engine": "MATLAB",
                "execution_time_seconds": round(elapsed, 3),
                "output_path": output_path,
            }
        except Exception as e:
            logger.error(f"MATLAB preprocessing execution error: {e}")
            raise RuntimeError(f"MATLAB preprocessing failed: {str(e)}")

    def shutdown(self):
        """Cleanly closes MATLAB Engine session."""
        if self.engine_instance:
            try:
                self.engine_instance.quit()
            except Exception:
                pass
            self.engine_instance = None
            self.is_connected = False

    def _discover_matlab_scripts(self) -> List[str]:
        """Scans matlab/ folder for verified .m function files."""
        scripts = []
        if _MATLAB_DIR.exists():
            for f in _MATLAB_DIR.glob("**/*.m"):
                scripts.append(f.name)
        return sorted(scripts)


# Module-level singleton
_matlab_adapter: Optional[MatlabAdapter] = None


def get_matlab_adapter() -> MatlabAdapter:
    global _matlab_adapter
    if _matlab_adapter is None:
        _matlab_adapter = MatlabAdapter()
    return _matlab_adapter

