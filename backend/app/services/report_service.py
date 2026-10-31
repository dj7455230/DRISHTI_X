"""
DRISHTI-X — Report Generation Service
Generates structured screening reports as JSON (and optionally HTML/PDF).

Every report is clearly labeled:
  AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS

Reports include:
  - Patient information
  - Image quality
  - DR grade + confidence
  - Lesion findings
  - Grad-CAM reference
  - Evidence summary
  - Risk level + referral priority
  - Assurance decision
  - Doctor review (if completed)
  - Audit trail reference
  - Disclaimer
"""
import os
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pathlib import Path


MANDATORY_CLINICAL_DISCLAIMER = (
    "DRISHTI-X provides AI-assisted diabetic retinopathy screening support only. "
    "This result is not a definitive diagnosis and must be reviewed by a qualified eye-care professional. "
    "Model predictions and heatmaps may be incorrect. Unsuitable images may require recapture. "
    "Clinical decisions must not be based solely on this AI output."
)
DISCLAIMER = MANDATORY_CLINICAL_DISCLAIMER

DR_GRADE_LABELS = {
    0: "No DR",
    1: "Mild Non-Proliferative DR (NPDR)",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR (PDR)",
}


def generate_report(
    screening,
    patient,
    fundus_image,
    prediction,
    doctor_review,
    generated_by_user_id: Optional[str] = None,
    output_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate a structured screening report dict.
    Saves as JSON. HTML/PDF generation can be added here.

    Returns the report dict.
    """
    if output_dir is None:
        from app.core.config import settings
        output_dir = settings.REPORTS_DIR
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()

    # ── Quality summary ──────────────────────────────────────
    quality_summary = None
    if fundus_image:
        qd = fundus_image.quality_detail or {}
        quality_summary = {
            "quality_score":       fundus_image.quality_score,
            "focus_score":         fundus_image.focus_score,
            "illumination_score":  fundus_image.illumination_score,
            "fov_score":           fundus_image.fov_score,
            "is_gradable":         fundus_image.is_gradable,
            "quality_status":      qd.get("quality_status", "GRADABLE" if fundus_image.is_gradable else "UNGRADABLE"),
            "quality_warnings":    qd.get("quality_warnings", []),
            "recapture_guidance":  qd.get("recapture_guidance", []),
            "feedback":            fundus_image.quality_feedback,
            "original_path":       fundus_image.original_path,
            "thumbnail_path":      fundus_image.thumbnail_path,
            "image_width":         fundus_image.image_width,
            "image_height":        fundus_image.image_height,
        }

    # ── Prediction summary ───────────────────────────────────
    ai_summary = None
    if prediction:
        grade = prediction.predicted_grade
        gradcam_dir = os.path.dirname(prediction.gradcam_path) if prediction.gradcam_path else None
        overlay_path = prediction.gradcam_path
        heatmap_path = (
            os.path.join(gradcam_dir, "heatmap.jpg")
            if gradcam_dir and os.path.exists(os.path.join(gradcam_dir, "heatmap.jpg"))
            else None
        )
        ai_summary = {
            "predicted_grade":   grade,
            "grade_label":       DR_GRADE_LABELS.get(grade, "Unknown") if grade is not None else "NOT AVAILABLE",
            "confidence":        prediction.confidence,
            "confidence_type":   "Model probability — not calibrated",
            "probabilities":     prediction.probabilities,
            "class_probabilities": prediction.probabilities,
            "is_referable":      prediction.is_referable,
            "model_name":        prediction.model_name or "EfficientNet-B0",
            "model_version":     prediction.model_version or "1.0.0",
            "model_status":      prediction.model_status,
            "is_demo":           prediction.is_demo,
            "weights_hash":      prediction.weights_hash,
            "gradcam_available": prediction.gradcam_path is not None,
            "gradcam_path":      prediction.gradcam_path,
            "gradcam_overlay_path": overlay_path,
            "gradcam_heatmap_path": heatmap_path,
            "gradcam_target_layer": prediction.gradcam_target_layer,
            "lesion_mask_path":  prediction.lesion_mask_path,
            "lesion_summary":    prediction.lesion_summary,
            "concordance_score": prediction.concordance_score,
            "concordance_level": prediction.concordance_level,
            "mismatch_detected": prediction.mismatch_detected,
            "mismatch_details":  prediction.mismatch_details,
        }

    # ── Doctor review summary ────────────────────────────────
    doctor_summary = None
    if doctor_review:
        doc_grade = doctor_review.doctor_grade
        doctor_summary = {
            "doctor_grade":       doc_grade,
            "doctor_grade_label": DR_GRADE_LABELS.get(doc_grade, "Unknown") if doc_grade is not None else None,
            "doctor_is_referable": doctor_review.doctor_is_referable,
            "doctor_notes":       doctor_review.doctor_notes,
            "ai_grade_accepted":  doctor_review.ai_grade_accepted,
            "ai_grade_modified":  doctor_review.ai_grade_modified,
            "reviewed_at":        doctor_review.reviewed_at.isoformat() if doctor_review.reviewed_at else None,
        }

    # ── Assurance + referral ─────────────────────────────────
    assurance_summary = {
        "decision":          screening.assurance_decision.value if screening.assurance_decision else None,
        "reasons":           screening.assurance_reasons,
        "referral_priority": screening.referral_priority.value if screening.referral_priority else None,
        "referral_score":    screening.referral_score,
        "is_referable":      screening.is_referable,
    }

    # ── Recommendation ───────────────────────────────────────
    recommendation = _generate_recommendation(
        assurance_summary["decision"],
        assurance_summary["referral_priority"],
        ai_summary,
        doctor_summary,
    )

    # ── Final report ─────────────────────────────────────────
    report = {
        "report_id":          f"RPT-{screening.id}",
        "generated_at":       timestamp,
        "generated_by":       str(generated_by_user_id) if generated_by_user_id else "SYSTEM",
        "disclaimer":         DISCLAIMER,
        "screening": {
            "id":                 str(getattr(screening, "id", "")),
            "case_number":        getattr(screening, "case_number", None) or f"DX-CASE-{datetime.now(timezone.utc).strftime('%Y%m')}-{str(getattr(screening, 'id', ''))[:6].upper()}",
            "patient_id":         str(getattr(screening, "patient_id", "")),
            "eye_side":           getattr(screening, "eye_side", "RIGHT") or "RIGHT",
            "screening_purpose":  getattr(screening, "screening_purpose", "ROUTINE_DR_SCREENING"),
            "screening_notes":    getattr(screening, "screening_notes", None),
            "referral_source":    getattr(screening, "referral_source", None),
            "facility_name":      getattr(screening, "facility_name", None),
            "operator_name":      getattr(screening, "operator_name", None),
            "priority_level":     getattr(screening, "priority_level", "ROUTINE") or "ROUTINE",
            "priority_score":     getattr(screening, "priority_score", 0.0) or 0.0,
            "priority_factors":   getattr(screening, "priority_factors", []) or [],
            "priority_rule_version": getattr(screening, "priority_rule_version", "1.0.0") or "1.0.0",
            "created_at":         screening.created_at.isoformat() if getattr(screening, "created_at", None) else None,
            "analyzed_at":        screening.analyzed_at.isoformat() if getattr(screening, "analyzed_at", None) else None,
            "status":             screening.status.value if getattr(screening, "status", None) else None,
        },
        "patient": {
            "patient_code":            getattr(patient, "patient_code", "UNKNOWN") if patient else "UNKNOWN",
            "name":                    (getattr(patient, "name", None) if not getattr(patient, "is_anonymous", False) else "Anonymous / Rural Walk-in") if patient else "UNKNOWN",
            "age":                     getattr(patient, "age", None) if patient else None,
            "date_of_birth":           getattr(patient, "date_of_birth").isoformat() if (patient and getattr(patient, "date_of_birth", None)) else None,
            "gender":                  patient.gender.value if (patient and getattr(patient, "gender", None) and hasattr(patient.gender, "value")) else getattr(patient, "gender", None) if patient else None,
            "is_anonymous":            getattr(patient, "is_anonymous", False) if patient else False,
            "diabetes_type":           getattr(patient, "diabetes_type", None) if patient else None,
            "diabetes_duration_years": getattr(patient, "diabetes_duration_years", None) if patient else None,
            "diabetes_treatment":      getattr(patient, "diabetes_treatment", None) if patient else None,
            "hba1c_value":             getattr(patient, "hba1c_value", None) if patient else None,
            "hba1c_unit":              getattr(patient, "hba1c_unit", "%") if patient else "%",
            "blood_glucose_value":     getattr(patient, "blood_glucose_value", None) if patient else None,
            "blood_glucose_unit":      getattr(patient, "blood_glucose_unit", "mg/dL") if patient else "mg/dL",
            "blood_glucose_type":      getattr(patient, "blood_glucose_type", None) if patient else None,
            "visual_symptoms":         getattr(patient, "visual_symptoms", None) if patient else None,
            "history_of_dr":           getattr(patient, "history_of_dr", None) if patient else None,
            "previous_eye_treatment":  getattr(patient, "previous_eye_treatment", None) if patient else None,
            "relevant_eye_conditions": getattr(patient, "relevant_eye_conditions", None) if patient else None,
            "district":                getattr(patient, "district", None) if patient else None,
            "state":                   getattr(patient, "state", None) if patient else None,
        },
        "image_quality":      quality_summary,
        "ai_prediction":      ai_summary,
        "doctor_review":      doctor_summary,
        "assurance":          assurance_summary,
        "recommendation":     recommendation,
    }

    # Save to disk
    report_path = os.path.join(output_dir, f"report_{screening.id}.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    return report


def _generate_recommendation(
    assurance_decision: Optional[str],
    referral_priority: Optional[str],
    ai_summary: Optional[Dict],
    doctor_summary: Optional[Dict],
) -> Dict[str, Any]:
    """Generate a structured recommendation based on assurance + grade."""

    # Use doctor grade if available, fall back to AI grade
    final_grade = None
    if doctor_summary and doctor_summary.get("doctor_grade") is not None:
        final_grade = doctor_summary["doctor_grade"]
        grade_source = "DOCTOR"
    elif ai_summary and ai_summary.get("predicted_grade") is not None:
        final_grade = ai_summary["predicted_grade"]
        grade_source = "AI_MODEL"
    else:
        grade_source = "UNAVAILABLE"

    # Clinical pathway
    if assurance_decision == "RECAPTURE_REQUIRED":
        pathway = "RECAPTURE_REQUIRED"
        action = "Recapture fundus image with improved focus and illumination before proceeding."
    elif final_grade in (3, 4) or referral_priority in ("CRITICAL", "HIGH"):
        pathway = "IMMEDIATE_REFERRAL"
        action = "Immediate telemedicine referral to District Eye Specialist Hospital."
    elif final_grade == 2 or referral_priority == "MEDIUM":
        pathway = "REFERRAL_WITHIN_ONE_MONTH"
        action = "Refer to ophthalmologist within one month. Monitor for progression."
    elif assurance_decision == "HUMAN_REVIEW_REQUIRED":
        pathway = "HUMAN_REVIEW_REQUIRED"
        action = "Ophthalmologist review required before any clinical decision."
    elif final_grade in (0, 1):
        pathway = "ROUTINE_SCREENING"
        action = "Annual routine re-screening in 12 months."
    else:
        pathway = "UNDETERMINED"
        action = "Model prediction unavailable. Ophthalmologist review required."

    return {
        "clinical_pathway":  pathway,
        "action":            action,
        "final_grade":       final_grade,
        "grade_source":      grade_source,
        "referral_priority": referral_priority,
    }
