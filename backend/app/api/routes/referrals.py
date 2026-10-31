"""
DRISHTI-X — Referrals Management Routes
GET   /api/referrals        — list referrals with status/urgency filtering
GET   /api/referrals/{id}   — get specific referral
PATCH /api/referrals/{id}   — update referral status, appointment, notes
"""
import uuid
from typing import Annotated, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.models.user import User
from app.models.screening import Referral, Screening, ReferralStatus, ReferralPriority, ScreeningStatus
from app.schemas.screening import ReferralOut, ReferralUpdate
from app.models.audit import AuditLog
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/referrals", tags=["Referrals"])


@router.get("", response_model=List[ReferralOut])
def list_referrals(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    query = db.query(Referral)
    if status:
        query = query.filter(Referral.status == status)
    if urgency:
        query = query.filter(Referral.urgency == urgency)
    return query.order_by(Referral.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{referral_id}", response_model=ReferralOut)
def get_referral(
    referral_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    ref = db.query(Referral).filter(Referral.id == referral_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Referral not found.")
    return ref


@router.patch("/{referral_id}", response_model=ReferralOut)
def update_referral(
    referral_id: uuid.UUID,
    payload: ReferralUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    ref = db.query(Referral).filter(Referral.id == referral_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Referral not found.")

    old_status = ref.status

    if payload.status is not None:
        ref.status = payload.status
        # If referral is closed or resolved, sync screening status
        if payload.status == ReferralStatus.CLOSED:
            screening = db.query(Screening).filter(Screening.id == ref.screening_id).first()
            if screening:
                screening.status = ScreeningStatus.CLOSED
    if payload.urgency is not None:
        ref.urgency = payload.urgency
    if payload.referred_facility is not None:
        ref.referred_facility = payload.referred_facility
    if payload.appointment_date is not None:
        ref.appointment_date = payload.appointment_date
    if payload.follow_up_date is not None:
        ref.follow_up_date = payload.follow_up_date
    if payload.clinical_notes is not None:
        ref.clinical_notes = payload.clinical_notes
    if payload.outcome_notes is not None:
        ref.outcome_notes = payload.outcome_notes
    if payload.assigned_to is not None:
        ref.assigned_to = payload.assigned_to

    ref.updated_at = datetime.now(timezone.utc)

    # Audit log
    audit = AuditLog(
        user_id=current_user.id,
        screening_id=ref.screening_id,
        action="REFERRAL_UPDATED",
        detail=f"Status changed from {old_status} to {ref.status}",
        old_value={"status": str(old_status)},
        new_value={"status": str(ref.status)},
    )
    db.add(audit)
    db.commit()
    db.refresh(ref)
    return ref

