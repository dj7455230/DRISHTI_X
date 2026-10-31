"""
DRISHTI-X — MATLAB Bridge / Fallback Layer

When MATLAB Engine is available: delegates processing to MATLAB scripts.
When MATLAB Engine is unavailable: transparently falls back to Python
equivalents — but ALWAYS reports the actual execution path.

Never silently pretends MATLAB ran when it didn't.
"""
import os
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("drishti.matlab_bridge")


class MatlabBridge:
    """
    Unified interface for MATLAB ↔ Python processing.
    Status is always explicit.
    """

    def __init__(self):
        self.matlab_available = False
        self.engine = None
        self._try_connect()

    def _try_connect(self):
        """Attempt to start MATLAB Engine API for Python."""
        try:
            import matlab.engine
            self.engine = matlab.engine.start_matlab()
            self.matlab_available = True
            logger.info("MATLAB Engine connected successfully.")
        except ImportError:
            logger.warning(
                "MATLAB Engine API not installed. "
                "Python fallback pipeline will be used. "
                "Status: MATLAB ENGINE UNAVAILABLE"
            )
        except Exception as e:
            logger.warning(
                f"MATLAB Engine failed to start: {e}. "
                "Python fallback pipeline will be used."
            )

    def get_status(self) -> Dict[str, Any]:
        return {
            "matlab_available": self.matlab_available,
            "status": "MATLAB ENGINE AVAILABLE" if self.matlab_available
                      else "MATLAB ENGINE UNAVAILABLE",
            "fallback": "Python CV pipeline active",
        }

    def run_quality_assessment(self, image_path: str) -> Dict[str, Any]:
        """Quality assessment: MATLAB preferred, Python fallback."""
        if self.matlab_available:
            try:
                result = self.engine.drishti_quality_assessment(
                    image_path, nargout=1
                )
                result["execution_engine"] = "MATLAB"
                return result
            except Exception as e:
                logger.error(f"MATLAB quality assessment failed: {e}. Using Python fallback.")

        # Python fallback
        from ai.quality.quality_engine import assess_image_quality
        result = assess_image_quality(image_path)
        result["execution_engine"] = "PYTHON_FALLBACK"
        result["matlab_note"] = "MATLAB ENGINE UNAVAILABLE — Python fallback used"
        return result

    def run_preprocessing(self, image_path: str, output_path: str) -> Dict[str, Any]:
        """Preprocessing: MATLAB preferred, Python fallback."""
        if self.matlab_available:
            try:
                self.engine.drishti_preprocess(image_path, output_path, nargout=0)
                return {"output_path": output_path, "execution_engine": "MATLAB"}
            except Exception as e:
                logger.error(f"MATLAB preprocessing failed: {e}. Using Python fallback.")

        from ai.classification.preprocessing import preprocess_fundus
        _, saved = preprocess_fundus(image_path, output_path=output_path)
        return {
            "output_path": saved,
            "execution_engine": "PYTHON_FALLBACK",
            "matlab_note": "MATLAB ENGINE UNAVAILABLE — Python fallback used",
        }

    def run_lesion_segmentation(self, image_path: str,
                                output_mask_path: str) -> Dict[str, Any]:
        """Lesion segmentation: MATLAB preferred, Python fallback."""
        if self.matlab_available:
            try:
                result = self.engine.drishti_segment_lesions(
                    image_path, output_mask_path, nargout=1
                )
                result["execution_engine"] = "MATLAB"
                return result
            except Exception as e:
                logger.error(f"MATLAB segmentation failed: {e}. Using Python fallback.")

        from ai.evidence.lesion_evidence import analyze_lesions
        result = analyze_lesions(image_path, output_mask_path=output_mask_path)
        result["execution_engine"] = "PYTHON_FALLBACK"
        result["matlab_note"] = "MATLAB ENGINE UNAVAILABLE — Python fallback used"
        return result

    def shutdown(self):
        """Cleanly shut down MATLAB Engine if running."""
        if self.matlab_available and self.engine:
            try:
                self.engine.quit()
                logger.info("MATLAB Engine shut down.")
            except Exception:
                pass


# Module-level singleton
_bridge: Optional[MatlabBridge] = None


def get_matlab_bridge() -> MatlabBridge:
    global _bridge
    if _bridge is None:
        _bridge = MatlabBridge()
    return _bridge
