"""
DRISHTI-X — Patient Routes
POST /api/patients
GET  /api/patients
GET  /api/patients/{id}
"""
import uuid
import random
import string
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.models.patient import Patient
from app.models.screening import Screening
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


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(
    payload: PatientCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Register a new patient with complete clinical demographics and medical history."""
    try:
        if not payload.is_anonymous and not (payload.name and payload.name.strip()):
            raise HTTPException(
                status_code=422,
                detail="Patient name is required when registration is not anonymous."
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
            clinical_history=payload.clinical_history,
            facility_code=payload.facility_code or current_user.facility_name,
            district=payload.district or current_user.facility_location,
            state=payload.state,
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
