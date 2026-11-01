from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
import uuid
from app.models.patient import Gender


class PatientCreate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None
    is_anonymous: Optional[bool] = False

    # Clinical History
    diabetes_type: Optional[str] = None
    diabetes_duration_years: Optional[int] = None
    diabetes_treatment: Optional[str] = None
    hba1c_value: Optional[float] = None
    hba1c_unit: Optional[str] = "%"
    hba1c_date: Optional[date] = None
    blood_glucose_value: Optional[float] = None
    blood_glucose_unit: Optional[str] = "mg/dL"
    blood_glucose_type: Optional[str] = None
    history_of_dr: Optional[str] = None
    last_retinal_exam_date: Optional[date] = None
    previous_eye_treatment: Optional[str] = None
    relevant_eye_conditions: Optional[str] = None
    visual_symptoms: Optional[List[str]] = None
    symptom_onset: Optional[str] = None
    pregnancy_status: Optional[str] = None
    diabetes_status: Optional[str] = None
    blood_pressure: Optional[str] = None
    relevant_medications: Optional[str] = None
    clinical_history: Optional[Dict[str, Any]] = None

    facility_code: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    preferred_language: Optional[str] = "HINDI"
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None
    is_anonymous: Optional[bool] = None

    diabetes_type: Optional[str] = None
    diabetes_duration_years: Optional[int] = None
    diabetes_treatment: Optional[str] = None
    hba1c_value: Optional[float] = None
    hba1c_unit: Optional[str] = None
    hba1c_date: Optional[date] = None
    blood_glucose_value: Optional[float] = None
    blood_glucose_unit: Optional[str] = None
    blood_glucose_type: Optional[str] = None
    history_of_dr: Optional[str] = None
    last_retinal_exam_date: Optional[date] = None
    previous_eye_treatment: Optional[str] = None
    relevant_eye_conditions: Optional[str] = None
    visual_symptoms: Optional[List[str]] = None
    symptom_onset: Optional[str] = None
    pregnancy_status: Optional[str] = None
    diabetes_status: Optional[str] = None
    blood_pressure: Optional[str] = None
    relevant_medications: Optional[str] = None
    clinical_history: Optional[Dict[str, Any]] = None

    facility_code: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    preferred_language: Optional[str] = "HINDI"
    notes: Optional[str] = None


class PatientOut(BaseModel):
    id: uuid.UUID
    patient_code: str
    name: Optional[str] = None
    age: Optional[int] = None
    date_of_birth: Optional[date] = None
    gender: Optional[Gender] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None
    is_anonymous: Optional[bool] = False

    diabetes_type: Optional[str] = None
    diabetes_duration_years: Optional[int] = None
    diabetes_treatment: Optional[str] = None
    hba1c_value: Optional[float] = None
    hba1c_unit: Optional[str] = None
    hba1c_date: Optional[date] = None
    blood_glucose_value: Optional[float] = None
    blood_glucose_unit: Optional[str] = None
    blood_glucose_type: Optional[str] = None
    history_of_dr: Optional[str] = None
    last_retinal_exam_date: Optional[date] = None
    previous_eye_treatment: Optional[str] = None
    relevant_eye_conditions: Optional[str] = None
    visual_symptoms: Optional[List[str]] = None
    symptom_onset: Optional[str] = None
    pregnancy_status: Optional[str] = None
    diabetes_status: Optional[str] = None
    blood_pressure: Optional[str] = None
    relevant_medications: Optional[str] = None
    clinical_history: Optional[Dict[str, Any]] = None

    facility_code: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pin_code: Optional[str] = None
    preferred_language: Optional[str] = "HINDI"
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PatientWithHistory(PatientOut):
    screening_count: int = 0
    last_screening_date: Optional[datetime] = None
    latest_dr_grade: Optional[int] = None
