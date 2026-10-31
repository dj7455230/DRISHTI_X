"""
DRISHTI-X — Administrator Management Routes
Endpoints for user management, role assignment, system activity monitoring, and audit trails.
Strictly protected with `require_admin`.
"""
import uuid
from typing import Annotated, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
import os

from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.screening import Screening
from app.models.patient import Patient
from app.models.audit import AuditLog, ModelVersion
from app.schemas.user import UserOut, UserCreate, UserUpdateAdmin
from app.api.deps import require_admin, get_current_user
from app.core.security import hash_password
from app.core.config import settings

router = APIRouter(prefix="/api/admin", tags=["Administrator"])


@router.get("/users", response_model=List[UserOut])
def list_users(
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(require_admin)],
    role: Optional[UserRole] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """List all user accounts in the platform with optional filters (Admin only)."""
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(or_(User.email.ilike(s), User.full_name.ilike(s)))

    return query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_authorized_user(
    payload: UserCreate,
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(require_admin)],
):
    """Admin provisioning of authorized accounts with assigned role."""
    clean_email = payload.email.lower().strip()
    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists."
        )

    user = User(
        email=clean_email,
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(payload.password),
        role=payload.role,
        facility_name=payload.facility_name,
        facility_location=payload.facility_location,
        is_active=True,
        is_verified=True,
        auth_provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(AuditLog(
        user_id=admin_user.id,
        action="ADMIN_CREATE_USER",
        resource_type="user",
        resource_id=str(user.id),
        user_role=admin_user.role.value,
        detail=f"Admin {admin_user.email} created user {user.email} with role {user.role.value}",
    ))
    db.commit()
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user_account(
    user_id: uuid.UUID,
    payload: UserUpdateAdmin,
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(require_admin)],
):
    """Assign roles, enable/disable accounts, or update facility details (Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    # Guard: prevent admin from disabling their own account
    if user.id == admin_user.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own administrator account.")

    update_dict = payload.model_dump(exclude_unset=True)
    old_state = {"role": user.role.value, "is_active": user.is_active}

    for key, val in update_dict.items():
        setattr(user, key, val)

    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    db.add(AuditLog(
        user_id=admin_user.id,
        action="ADMIN_UPDATE_USER",
        resource_type="user",
        resource_id=str(user.id),
        user_role=admin_user.role.value,
        old_value=old_state,
        new_value={"role": user.role.value, "is_active": user.is_active},
        detail=f"Admin {admin_user.email} updated user {user.email}: {update_dict}",
    ))
    db.commit()
    return user


@router.get("/audit-logs")
def list_system_audit_logs(
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(require_admin)],
    action: Optional[str] = Query(None),
    user_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """Retrieve platform audit log trail for governance and security compliance."""
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    logs = query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "screening_id": str(log.screening_id) if log.screening_id else None,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "user_role": log.user_role,
            "detail": log.detail,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "ip_address": log.ip_address,
            "model_version": log.model_version,
            "prev_event_hash": log.prev_event_hash,
            "event_hash": log.event_hash,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        }
        for log in logs
    ]


@router.get("/audit/verify-chain")
def verify_audit_trail_chain(
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(require_admin)],
):
    """
    Feature 44: Cryptographic verification of the append-only audit trail hash chain.
    Detects record tampering or deletion.
    """
    from app.services.audit_service import AuditService
    return AuditService.verify_chain(db)


@router.get("/stats")
def get_system_admin_stats(
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(require_admin)],
):
    """Aggregate statistics for admin dashboard."""
    total_users = db.query(func.count(User.id)).scalar()
    hw_count = db.query(func.count(User.id)).filter(User.role == UserRole.HEALTH_WORKER).scalar()
    doc_count = db.query(func.count(User.id)).filter(User.role == UserRole.OPHTHALMOLOGIST).scalar()
    admin_count = db.query(func.count(User.id)).filter(User.role == UserRole.ADMIN).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()

    total_screenings = db.query(func.count(Screening.id)).scalar()
    total_patients = db.query(func.count(Patient.id)).scalar()
    total_audits = db.query(func.count(AuditLog.id)).scalar()

    return {
        "users": {
            "total": total_users,
            "health_workers": hw_count,
            "ophthalmologists": doc_count,
            "admins": admin_count,
            "active": active_users,
        },
        "screening_metrics": {
            "total_screenings": total_screenings,
            "total_patients": total_patients,
            "audit_trail_events": total_audits,
        },
        "system_status": "OPERATIONAL",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

