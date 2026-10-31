"""
DRISHTI-X — Evidence Capsule Service (Feature 33)
Compact, privacy-preserving, bandwidth-optimized summary packet designed for
intermittent rural PHC connectivity. Transmits diagnostic summary first,
followed by full-resolution fundus images when network capacity permits.

Capsule Schema Version: 1.0.0
"""
import io
import json
import base64
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple
from PIL import Image


CAPSULE_SCHEMA_VERSION = "1.0.0"
DEFAULT_FACILITY_CODE = "PHC-RURAL-01"


def generate_privacy_preserving_patient_ref(patient_code: Optional[str], patient_id: Any) -> str:
    """
    Creates a privacy-preserving identifier for low-bandwidth capsule transport.
    Avoids transmitting full patient demographic PII over public low-bandwidth channels.
    """
    base = f"{patient_code or 'ANON'}:{str(patient_id)}"
    digest = hashlib.sha256(base.encode("utf-8")).hexdigest()[:12].upper()
    prefix = patient_code[:6].upper() if patient_code else "PT"
    return f"REF-{prefix}-{digest}"


def generate_thumbnail_base64(image_bytes: bytes, max_size: int = 128, quality: int = 70) -> Optional[str]:
    """
    Creates a highly compressed JPEG thumbnail base64 data string (~2-5 KB)
    for low-bandwidth capsule preview.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        return None


def calculate_image_sha256(image_bytes: bytes) -> str:
    """Computes SHA-256 checksum for retinal image verification."""
    return hashlib.sha256(image_bytes).hexdigest()


class EvidenceCapsuleService:
    """
    Feature 33: Builds, validates, and unpacks compact Evidence Capsules.
    """

    @classmethod
    def build_capsule(
        cls,
        case_id: str,
        case_number: str,
        patient_id: str,
        patient_code: Optional[str] = None,
        facility_code: str = DEFAULT_FACILITY_CODE,
        screening_timestamp: Optional[datetime] = None,
        # AI inference outputs (None if capsule created prior to AI inference)
        prediction: Optional[Dict[str, Any]] = None,
        image_quality: Optional[Dict[str, Any]] = None,
        assurance: Optional[Dict[str, Any]] = None,
        lesion_summary: Optional[Dict[str, Any]] = None,
        priority_info: Optional[Dict[str, Any]] = None,
        # Image bytes or existing hash
        image_bytes: Optional[bytes] = None,
        image_checksum: Optional[str] = None,
        include_thumbnail: bool = True,
        review_status: str = "PENDING",
    ) -> Dict[str, Any]:
        """
        Synthesizes the 17-field compact Evidence Capsule.
        Strict Safety Rule: If prediction is None, explicitly tags AI_ANALYSIS_PENDING.
        Never fabricates DR grades, confidences, or lesion findings.
        """
        now_utc = datetime.now(timezone.utc)
        ts = screening_timestamp or now_utc

        # Checksum calculation
        actual_checksum = image_checksum
        if not actual_checksum and image_bytes:
            actual_checksum = calculate_image_sha256(image_bytes)
        elif not actual_checksum:
            actual_checksum = "0" * 64

        # Thumbnail generation
        thumb_b64 = None
        if include_thumbnail and image_bytes:
            thumb_b64 = generate_thumbnail_base64(image_bytes, max_size=128, quality=70)

        # 1. Case & Patient Identifiers
        patient_ref_id = generate_privacy_preserving_patient_ref(patient_code, patient_id)

        # 2. AI Inference Status
        if prediction is not None:
            predicted_grade = prediction.get("predicted_grade")
            grade_label = prediction.get("grade_label", "Unknown")
            confidence = prediction.get("confidence")
            calibration_status = prediction.get("calibration_status", "CALIBRATED_TEMPERATURE_SCALING")
            ai_engine = prediction.get("model_name", "EfficientNet-B0")
            model_version = prediction.get("model_version", "1.0.0")
        else:
            predicted_grade = None
            grade_label = "AI_ANALYSIS_PENDING"
            confidence = None
            calibration_status = "AI_ANALYSIS_PENDING"
            ai_engine = "EfficientNet-B0 + U-Net (Pending)"
            model_version = "1.0.0"

        # 3. Quality Status
        if image_quality is not None:
            quality_status = image_quality.get("quality_status") or ("GRADABLE" if image_quality.get("is_gradable") else "UNGRADABLE")
        else:
            quality_status = "PENDING_ASSESSMENT"

        # 4. Clinical Assurance Decision
        if assurance is not None:
            assurance_decision = assurance.get("decision", "HUMAN_REVIEW_REQUIRED")
            concordance_flags = {
                "concordance_level": assurance.get("concordance_level", "UNKNOWN"),
                "mismatch_detected": bool(assurance.get("mismatch_detected", False)),
            }
        else:
            assurance_decision = "AI_ANALYSIS_PENDING"
            concordance_flags = {
                "concordance_level": "PENDING",
                "mismatch_detected": False,
            }

        # 5. Priority Triage
        if priority_info:
            priority_level = priority_info.get("priority_level", "ROUTINE")
            priority_score = float(priority_info.get("priority_score", 0.0))
            priority_reason = priority_info.get("priority_reason") or "Operational Triage Priority"
        elif assurance and "referral_priority" in assurance:
            priority_level = assurance.get("referral_priority", "ROUTINE")
            priority_score = float(assurance.get("referral_score", 0.0))
            priority_reason = assurance.get("urgency_rationale", "Derived from clinical assurance")
        else:
            priority_level = "ROUTINE"
            priority_score = 0.0
            priority_reason = "Initial screening intake priority"

        # 6. Lesion Evidence Summary
        compact_lesion_summary = None
        if lesion_summary:
            compact_lesion_summary = {
                "microaneurysms": lesion_summary.get("microaneurysm_count", 0),
                "hemorrhages": lesion_summary.get("hemorrhage_count", 0),
                "hard_exudates": lesion_summary.get("exudate_count", 0),
                "soft_exudates": lesion_summary.get("soft_exudate_count", 0),
                "lesion_evidence_score": lesion_summary.get("lesion_evidence_score", 0.0),
            }

        capsule = {
            "capsule_version": CAPSULE_SCHEMA_VERSION,
            "created_at": now_utc.isoformat(),
            # 1. Case ID
            "case_id": str(case_id),
            # 2. Patient Reference ID
            "patient_ref_id": patient_ref_id,
            # 3. Screening Timestamp
            "screening_timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            # 4. PHC Centre Identifier
            "facility_code": facility_code,
            # 5. AI Engine & Version
            "ai_engine": ai_engine,
            "model_version": model_version,
            # 6. AI-Predicted DR Grade
            "predicted_grade": predicted_grade,
            "grade_label": grade_label,
            # 7. Confidence & Calibration Status
            "confidence": confidence,
            "calibration_status": calibration_status,
            # 8. Image Quality Status
            "image_quality_status": quality_status,
            # 9. Clinical Assurance Decision
            "assurance_decision": assurance_decision,
            # 10. Priority Level
            "priority_level": priority_level,
            # 11. Reason for Priority
            "priority_score": priority_score,
            "priority_reason": priority_reason,
            # 12. Lesion Evidence Summary
            "lesion_evidence_summary": compact_lesion_summary,
            # 13. Concordance and Mismatch Flags
            "concordance_flags": concordance_flags,
            # 14. Review Status
            "review_status": review_status,
            # 15. Privacy-Controlled Preview Thumbnail
            "thumbnail_preview": thumb_b64,
            # 16. Image Checksum & Metadata
            "image_checksum": actual_checksum,
            "case_number": case_number,
            # 17. Capsule Metadata
            "full_image_synced": False,
            "transport_protocol": "DRISHTI_RURAL_SYNC_V1",
        }
        return capsule

    @classmethod
    def validate_capsule(cls, capsule: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Validates the structure and cryptographic checksum format of an Evidence Capsule.
        Returns (is_valid, error_message).
        """
        required_keys = [
            "capsule_version",
            "case_id",
            "patient_ref_id",
            "facility_code",
            "image_checksum",
            "priority_level",
        ]
        for key in required_keys:
            if key not in capsule:
                return False, f"Missing required Evidence Capsule field: '{key}'"

        checksum = capsule.get("image_checksum", "")
        if not isinstance(checksum, str) or len(checksum) != 64:
            return False, f"Invalid SHA-256 image checksum length: {len(checksum)}"

        return True, None

    @classmethod
    def verify_full_image(cls, image_bytes: bytes, expected_checksum: str) -> bool:
        """Verifies an uploaded full-resolution image against the registered capsule checksum."""
        actual = calculate_image_sha256(image_bytes)
        return actual.lower() == expected_checksum.lower()

