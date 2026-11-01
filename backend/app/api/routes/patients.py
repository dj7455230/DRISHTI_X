"""
DRISHTI-X — Patient Routes
POST /api/patients
GET  /api/patients
GET  /api/patients/{id}
"""
import uuid
import random
import string
from typing import Annotated, List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.db.base import get_db
from app.models.patient import Patient
from app.models.screening import Screening, Prediction, FundusImage, DoctorReview, DoctorReviewAction
from datetime import datetime, date
from app.schemas.patient import PatientCreate, PatientUpdate, PatientOut, PatientWithHistory
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/patients", tags=["Patients"])


def generate_patient_code() -> str:
    """Generate a de-identified patient code: DX-YYYYMM-XXXXXX"""
    from datetime import datetime
    prefix = datetime.now().strftime("DX-%Y%m-")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return prefix + suffix


@router.post("/check-duplicate")
def check_duplicate_patient(
    payload: Dict[str, Any],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Search for potential duplicate patient records based on Name + Contact or Name + DOB.
    Assists health workers in linking repeated screening visits rather than creating duplicate profiles.
    """
    name = payload.get("name")
    contact = payload.get("contact_number")
    dob = payload.get("date_of_birth")

    if not name or not str(name).strip():
        return {"is_duplicate": False, "match": None}

    clean_name = str(name).strip().lower()
    query = db.query(Patient).filter(func.lower(Patient.name) == clean_name)

    if contact and str(contact).strip():
        match = query.filter(Patient.contact_number == str(contact).strip()).first()
        if match:
            return {
                "is_duplicate": True,
                "match_reason": "MATCHING_NAME_AND_CONTACT",
                "patient": PatientOut.model_validate(match),
            }

    if dob:
        match = query.filter(Patient.date_of_birth == dob).first()
        if match:
            return {
                "is_duplicate": True,
                "match_reason": "MATCHING_NAME_AND_DOB",
                "patient": PatientOut.model_validate(match),
            }

    return {"is_duplicate": False, "match": None}


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(
    payload: PatientCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    prevent_duplicate: bool = Query(False),
):
    """Register a new patient with complete clinical demographics and medical history."""
    try:
        if not payload.is_anonymous and not (payload.name and payload.name.strip()):
            raise HTTPException(
                status_code=422,
                detail="Patient name is required when registration is not anonymous."
            )

        # Duplicate checking if prevent_duplicate is active
        if prevent_duplicate and not payload.is_anonymous and payload.name and payload.contact_number:
            existing = db.query(Patient).filter(
                func.lower(Patient.name) == payload.name.strip().lower(),
                Patient.contact_number == payload.contact_number.strip(),
            ).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Patient record already exists with code {existing.patient_code} for {existing.name}."
                )

        code = generate_patient_code()
        # Ensure uniqueness
        while db.query(Patient).filter(Patient.patient_code == code).first():
            code = generate_patient_code()

        # Calculate age automatically from date of birth if age not supplied directly
        computed_age = payload.age
        if computed_age is None and payload.date_of_birth is not None:
            today = date.today()
            computed_age = today.year - payload.date_of_birth.year - (
                (today.month, today.day) < (payload.date_of_birth.month, payload.date_of_birth.day)
            )

        patient = Patient(
            patient_code=code,
            name=payload.name.strip() if (payload.name and not payload.is_anonymous) else None,
            age=computed_age,
            date_of_birth=payload.date_of_birth,
            gender=payload.gender,
            contact_number=payload.contact_number.strip() if (payload.contact_number and not payload.is_anonymous) else None,
            address=payload.address.strip() if (payload.address and not payload.is_anonymous) else None,
            is_anonymous=payload.is_anonymous or False,
            diabetes_type=payload.diabetes_type,
            diabetes_duration_years=payload.diabetes_duration_years,
            diabetes_treatment=payload.diabetes_treatment,
            hba1c_value=payload.hba1c_value,
            hba1c_unit=payload.hba1c_unit or "%",
            hba1c_date=payload.hba1c_date,
            blood_glucose_value=payload.blood_glucose_value,
            blood_glucose_unit=payload.blood_glucose_unit or "mg/dL",
            blood_glucose_type=payload.blood_glucose_type,
            history_of_dr=payload.history_of_dr,
            last_retinal_exam_date=payload.last_retinal_exam_date,
            previous_eye_treatment=payload.previous_eye_treatment,
            relevant_eye_conditions=payload.relevant_eye_conditions,
            visual_symptoms=payload.visual_symptoms,
            symptom_onset=payload.symptom_onset,
            pregnancy_status=payload.pregnancy_status,
            diabetes_status=payload.diabetes_status,
            blood_pressure=payload.blood_pressure,
            relevant_medications=payload.relevant_medications,
            clinical_history=payload.clinical_history,
            facility_code=payload.facility_code or current_user.facility_name,
            district=payload.district or current_user.facility_location,
            state=payload.state,
            pin_code=payload.pin_code,
            preferred_language=payload.preferred_language or "HINDI",
            notes=payload.notes,
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to register patient: {str(exc)}")


@router.put("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: uuid.UUID,
    payload: PatientUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Update patient demographics or clinical history."""
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found.")

        update_data = payload.model_dump(exclude_unset=True)
        if "date_of_birth" in update_data and update_data["date_of_birth"] and "age" not in update_data:
            dob = update_data["date_of_birth"]
            today = date.today()
            update_data["age"] = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

        for key, val in update_data.items():
            setattr(patient, key, val)

        db.commit()
        db.refresh(patient)
        return patient
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update patient: {str(exc)}")


@router.get("", response_model=List[PatientWithHistory])
def list_patients(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    district: str = Query(None),
    search: str = Query(None),
):
    """List patients with summary info and optional search."""
    from sqlalchemy import or_
    query = db.query(Patient)
    if district:
        query = query.filter(Patient.district == district)
    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Patient.patient_code.ilike(search_term),
                Patient.name.ilike(search_term),
                Patient.district.ilike(search_term),
                Patient.contact_number.ilike(search_term),
            )
        )
    patients = query.order_by(Patient.created_at.desc()).offset(skip).limit(limit).all()

    results = []
    for p in patients:
        screenings = db.query(Screening).filter(Screening.patient_id == p.id).all()
        latest_grade = None
        last_date = None
        if screenings:
            latest = max(screenings, key=lambda s: s.created_at)
            last_date = latest.created_at
            if latest.prediction:
                latest_grade = latest.prediction.predicted_grade

        results.append(PatientWithHistory(
            **PatientOut.model_validate(p).model_dump(),
            screening_count=len(screenings),
            last_screening_date=last_date,
            latest_dr_grade=latest_grade,
        ))
    return results


@router.get("/{patient_id}", response_model=PatientWithHistory)
def get_patient(
    patient_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get a patient with their screening history."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    screenings = db.query(Screening).filter(Screening.patient_id == patient.id).all()
    latest_grade = None
    last_date = None
    if screenings:
        latest = max(screenings, key=lambda s: s.created_at)
        last_date = latest.created_at
        if latest.prediction:
            latest_grade = latest.prediction.predicted_grade

    return PatientWithHistory(
        **PatientOut.model_validate(patient).model_dump(),
        screening_count=len(screenings),
        last_screening_date=last_date,
        latest_dr_grade=latest_grade,
    )


@router.get("/{patient_id}/screenings")
def get_patient_screening_history(
    patient_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 25: Longitudinal screening history for a patient.
    Returns complete chronological screening list with AI predictions, quality, assurance, and doctor review.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    screenings = db.query(Screening).filter(
        Screening.patient_id == patient_id
    ).order_by(Screening.created_at.desc()).all()

    dr_labels = {
        0: "No DR", 1: "Mild NPDR", 2: "Moderate NPDR",
        3: "Severe NPDR", 4: "Proliferative DR"
    }

    history = []
    for s in screenings:
        pred = db.query(Prediction).filter(Prediction.screening_id == s.id).first()
        fundus = db.query(FundusImage).filter(FundusImage.screening_id == s.id).first()
        review = db.query(DoctorReview).filter(DoctorReview.screening_id == s.id).first()
        actions_count = db.query(func.count(DoctorReviewAction.id)).filter(
            DoctorReviewAction.screening_id == s.id
        ).scalar()

        doc_summary = None
        if review and review.doctor_grade is not None:
            doc_summary = {
                "doctor_grade": review.doctor_grade,
                "doctor_grade_label": dr_labels.get(review.doctor_grade),
                "doctor_notes": review.doctor_notes,
                "ai_grade_accepted": review.ai_grade_accepted,
                "ai_grade_modified": review.ai_grade_modified,
                "reviewed_at": review.reviewed_at.isoformat() if hasattr(review, "reviewed_at") and review.reviewed_at else None,
            }

        history.append({
            "id": str(s.id),
            "case_number": s.case_number or f"DX-CASE-{s.created_at.strftime('%Y%m')}-{str(s.id)[:6].upper()}",
            "patient_id": str(s.patient_id),
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
            "eye_side": s.eye_side,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "analyzed_at": s.analyzed_at.isoformat() if s.analyzed_at else None,
            "predicted_grade": pred.predicted_grade if pred else None,
            "grade_label": pred.grade_label if pred else None,
            "confidence": round(pred.confidence, 4) if pred and pred.confidence is not None else None,
            "is_referable": s.is_referable,
            "quality_score": round(fundus.quality_score, 1) if fundus and fundus.quality_score is not None else None,
            "is_gradable": fundus.is_gradable if fundus else False,
            "assurance_decision": s.assurance_decision.value if s.assurance_decision else None,
            "assurance_reasons": s.assurance_reasons or [],
            "priority_level": s.priority_level or "ROUTINE",
            "priority_score": round(s.priority_score, 1) if s.priority_score is not None else 0.0,
            "priority_factors": s.priority_factors or [],
            "doctor_review": doc_summary,
            "review_actions_count": actions_count or 0,
            "has_gradcam": bool(pred and pred.gradcam_path),
            "has_lesions": bool(pred and pred.lesion_summary),
        })

    return {
        "patient": {
            "id": str(patient.id),
            "patient_code": patient.patient_code,
            "name": patient.name if not patient.is_anonymous else "Anonymous Patient",
            "age": patient.age,
            "gender": patient.gender.value if hasattr(patient.gender, "value") else str(patient.gender) if patient.gender else None,
        },
        "screenings": history,
        "total_screenings": len(history),
    }


@router.get("/{patient_id}/compare")
def compare_patient_screenings(
    patient_id: uuid.UUID,
    screening1_id: uuid.UUID,
    screening2_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Feature 25: Longitudinal comparison between two screenings for the same patient.
    Calculates interval, grade changes, lesion progression, and displays mandatory clinical progression disclaimer.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    s1 = db.query(Screening).filter(Screening.id == screening1_id, Screening.patient_id == patient_id).first()
    s2 = db.query(Screening).filter(Screening.id == screening2_id, Screening.patient_id == patient_id).first()

    if not s1 or not s2:
        raise HTTPException(
            status_code=404,
            detail="One or both screenings not found for this patient."
        )

    # Order chronologically: baseline is earlier, follow_up is later
    if s1.created_at <= s2.created_at:
        base, follow = s1, s2
    else:
        base, follow = s2, s1

    interval_days = abs((follow.created_at - base.created_at).days)

    def _summarize_scr(s):
        p = db.query(Prediction).filter(Prediction.screening_id == s.id).first()
        f = db.query(FundusImage).filter(FundusImage.screening_id == s.id).first()
        r = db.query(DoctorReview).filter(DoctorReview.screening_id == s.id).first()
        return {
            "id": str(s.id),
            "case_number": s.case_number or f"DX-CASE-{s.created_at.strftime('%Y%m')}-{str(s.id)[:6].upper()}",
            "date": s.created_at.isoformat() if s.created_at else None,
            "eye_side": s.eye_side,
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
            "predicted_grade": p.predicted_grade if p else None,
            "grade_label": p.grade_label if p else None,
            "confidence": round(p.confidence, 4) if p and p.confidence else None,
            "quality_score": round(f.quality_score, 1) if f and f.quality_score is not None else None,
            "priority_level": s.priority_level or "ROUTINE",
            "priority_score": s.priority_score or 0.0,
            "doctor_grade": r.doctor_grade if r else None,
            "doctor_notes": r.doctor_notes if r else None,
            "lesion_summary": p.lesion_summary if p else None,
            "concordance_level": p.concordance_level if p else None,
        }

    b_sum = _summarize_scr(base)
    f_sum = _summarize_scr(follow)

    # Determine progression
    ai_status = "INDETERMINATE"
    if b_sum["predicted_grade"] is not None and f_sum["predicted_grade"] is not None:
        diff = f_sum["predicted_grade"] - b_sum["predicted_grade"]
        if diff > 0:
            ai_status = "PROGRESSED"
        elif diff < 0:
            ai_status = "REGRESSED"
        else:
            ai_status = "STABLE"

    doctor_status = "NOT_AVAILABLE"
    if b_sum["doctor_grade"] is not None and f_sum["doctor_grade"] is not None:
        ddiff = f_sum["doctor_grade"] - b_sum["doctor_grade"]
        if ddiff > 0:
            doctor_status = "PROGRESSED"
        elif ddiff < 0:
            doctor_status = "REGRESSED"
        else:
            doctor_status = "STABLE"

    return {
        "patient": {
            "id": str(patient.id),
            "patient_code": patient.patient_code,
            "name": patient.name if not patient.is_anonymous else "Anonymous Patient",
            "age": patient.age,
        },
        "interval_days": interval_days,
        "baseline": b_sum,
        "follow_up": f_sum,
        "progression": {
            "ai_progression": ai_status,
            "doctor_progression": doctor_status,
            "grade_delta": (f_sum["predicted_grade"] - b_sum["predicted_grade"]) if (b_sum["predicted_grade"] is not None and f_sum["predicted_grade"] is not None) else None,
        },
        "disclaimer": (
            "Progression analysis is an assistive comparison and must be clinically correlated with dilated fundus biomicroscopy. "
            "AI comparisons are supportive and do not replace clinical ophthalmic examination."
        ),
    }
