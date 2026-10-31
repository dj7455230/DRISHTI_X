"""
DRISHTI-X — FastAPI Dependencies
Shared dependencies: DB session, current user, role guards.
"""
import uuid
from typing import Annotated, Optional
from fastapi import Depends, HTTPException, status, Cookie
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.core.security import decode_access_token
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
    drishti_session: Annotated[Optional[str], Cookie()] = None,
) -> User:
    """Return the authenticated user from JWT token or HttpOnly session cookie."""
    auth_token = token or drishti_session
    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(auth_token)
    user_id_raw: str = payload.get("sub")
    user = None
    if user_id_raw:
        try:
            user_uuid = uuid.UUID(user_id_raw) if isinstance(user_id_raw, str) else user_id_raw
            user = db.query(User).filter(User.id == user_uuid).first()
        except Exception:
            user = None

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


def get_optional_current_user(
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
    drishti_session: Annotated[Optional[str], Cookie()] = None,
) -> Optional[User]:
    """Return the authenticated user if token/cookie provided, else None."""
    auth_token = token or drishti_session
    if not auth_token:
        return None
    try:
        payload = decode_access_token(auth_token)
        user_id_raw: str = payload.get("sub")
        if user_id_raw:
            user_uuid = uuid.UUID(user_id_raw) if isinstance(user_id_raw, str) else user_id_raw
            user = db.query(User).filter(User.id == user_uuid).first()
            if user and user.is_active:
                return user
    except Exception:
        return None
    return None


def require_health_worker(
    current_user: Annotated[User, Depends(get_current_user)]
) -> User:
    """Allow HEALTH_WORKER and ADMIN roles."""
    if current_user.role not in (UserRole.HEALTH_WORKER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Required role: HEALTH_WORKER or ADMIN",
        )
    return current_user


def require_doctor(
    current_user: Annotated[User, Depends(get_current_user)]
) -> User:
    """Allow OPHTHALMOLOGIST and ADMIN roles only."""
    if current_user.role not in (UserRole.OPHTHALMOLOGIST, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Required role: OPHTHALMOLOGIST or ADMIN",
        )
    return current_user


def require_admin(
    current_user: Annotated[User, Depends(get_current_user)]
) -> User:
    """Allow ADMIN role only."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Required role: ADMIN",
        )
    return current_user


def require_roles(*allowed_roles: UserRole):
    """Factory dependency for arbitrary role checks."""
    def _role_checker(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in allowed_roles and current_user.role != UserRole.ADMIN:
            allowed_names = [r.value for r in allowed_roles]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required one of: {allowed_names}",
            )
        return current_user
    return _role_checker
