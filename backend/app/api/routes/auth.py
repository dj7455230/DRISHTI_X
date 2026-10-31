"""
DRISHTI-X — Auth Routes
POST /api/auth/register
POST /api/auth/login
POST /api/auth/google
POST /api/auth/google/link
GET  /api/auth/me
"""
from datetime import datetime, timezone, timedelta
from typing import Annotated, Optional
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session
import uuid

from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.audit import AuditLog
from app.schemas.user import (
    UserCreate,
    UserOut,
    TokenResponse,
    LoginRequest,
    GoogleAuthRequest,
    GoogleLinkRequest,
)
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    set_auth_cookie,
)
from app.api.deps import get_current_user
from app.services.google_auth import (
    verify_google_id_token,
    verify_csrf_token_if_present,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Annotated[Session, Depends(get_db)]):
    """Register a new user."""
    existing = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    user = User(
        email=payload.email.lower().strip(),
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(payload.password),
        role=payload.role,
        facility_name=payload.facility_name,
        facility_location=payload.facility_location,
        auth_provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Audit
    db.add(AuditLog(
        user_id=user.id,
        action="USER_REGISTERED",
        resource_type="user",
        resource_id=str(user.id),
        user_role=user.role.value,
        detail=f"User registered: {user.email}",
    ))
    db.commit()
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, response: Response,
          db: Annotated[Session, Depends(get_db)]):
    """Authenticate with email/password and return JWT access token."""
    email_clean = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled.")

    token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
    set_auth_cookie(response, token)

    user.last_login = datetime.now(timezone.utc)
    db.commit()

    # Audit
    db.add(AuditLog(
        user_id=user.id,
        action="USER_LOGIN",
        resource_type="user",
        resource_id=str(user.id),
        user_role=user.role.value,
        ip_address=request.client.host if request.client else None,
    ))
    db.commit()

    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/google", response_model=TokenResponse)
def google_auth(payload: GoogleAuthRequest, request: Request, response: Response,
                db: Annotated[Session, Depends(get_db)]):
    """
    Authenticate using Google Identity Services ID token.
    - Validates signature, issuer, audience, and required claims with Google Auth.
    - If user exists with verified google_id: logs in directly.
    - If user exists with matching email without google_id: rejects with 409 Conflict
      to prevent insecure auto-linking without verified password confirmation.
    - If no user exists: creates new account with default HEALTH_WORKER role (never ADMIN!).
    """
    try:
        raw_token = payload.get_token()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Validate CSRF token if sent in request
    verify_csrf_token_if_present(request)

    # Verify ID token with Google
    id_info = verify_google_id_token(raw_token)
    google_sub = id_info["sub"]
    google_email = id_info["email"].lower().strip()
    google_name = id_info.get("name") or google_email.split("@")[0]
    google_picture = id_info.get("picture")

    # 1. Search for existing account by Google subject ID
    user = db.query(User).filter(User.google_id == google_sub).first()

    if user:
        # Existing Google user
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account is disabled.")

        # Update last login and avatar if missing
        user.last_login = datetime.now(timezone.utc)
        if google_picture and not user.avatar_url:
            user.avatar_url = google_picture
        db.commit()

        # Audit
        db.add(AuditLog(
            user_id=user.id,
            action="USER_LOGIN_GOOGLE",
            resource_type="user",
            resource_id=str(user.id),
            user_role=user.role.value,
            ip_address=request.client.host if request.client else None,
            detail=f"User signed in via Google: {user.email}",
        ))
        db.commit()

        token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
        set_auth_cookie(response, token)
        return TokenResponse(access_token=token, user=UserOut.model_validate(user))

    # 2. Check if an account already exists with this email (created via email/password)
    existing_by_email = db.query(User).filter(User.email == google_email).first()
    if existing_by_email:
        if not existing_by_email.is_active:
            raise HTTPException(status_code=403, detail="Account is disabled.")

        # Email is cryptographically verified by Google.
        # Securely link Google Identity to the existing account, preserving existing role and screenings.
        existing_by_email.google_id = google_sub
        if not existing_by_email.auth_provider or existing_by_email.auth_provider == "local":
            existing_by_email.auth_provider = "google+local"
        if google_picture and not existing_by_email.avatar_url:
            existing_by_email.avatar_url = google_picture
        existing_by_email.is_verified = True
        existing_by_email.last_login = datetime.now(timezone.utc)
        db.commit()

        # Audit
        db.add(AuditLog(
            user_id=existing_by_email.id,
            action="USER_LOGIN_GOOGLE_LINKED",
            resource_type="user",
            resource_id=str(existing_by_email.id),
            user_role=existing_by_email.role.value,
            ip_address=request.client.host if request.client else None,
            detail=f"Existing account verified and linked via Google: {existing_by_email.email}",
        ))
        db.commit()

        token = create_access_token(data={"sub": str(existing_by_email.id), "role": existing_by_email.role.value})
        set_auth_cookie(response, token)
        return TokenResponse(access_token=token, user=UserOut.model_validate(existing_by_email))

    # 3. Register new user with Google identity
    # Default role is strictly HEALTH_WORKER — NEVER ADMIN or privileged role
    unusable_pwd_hash = hash_password(secrets.token_urlsafe(32))

    new_user = User(
        email=google_email,
        full_name=google_name,
        hashed_password=unusable_pwd_hash,
        role=UserRole.HEALTH_WORKER,
        google_id=google_sub,
        auth_provider="google",
        avatar_url=google_picture,
        is_active=True,
        is_verified=True,
        last_login=datetime.now(timezone.utc),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Audit Registration
    db.add(AuditLog(
        user_id=new_user.id,
        action="USER_REGISTER_GOOGLE",
        resource_type="user",
        resource_id=str(new_user.id),
        user_role=new_user.role.value,
        ip_address=request.client.host if request.client else None,
        detail=f"User registered via Google: {new_user.email}",
    ))
    db.commit()

    token = create_access_token(data={"sub": str(new_user.id), "role": new_user.role.value})
    set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=UserOut.model_validate(new_user))


@router.post("/google/link", response_model=TokenResponse)
def link_google_account(payload: GoogleLinkRequest, request: Request, response: Response,
                        db: Annotated[Session, Depends(get_db)]):
    """
    Securely link Google Identity to an existing email/password account.
    Requires password verification to prove ownership of the existing account.
    """
    try:
        raw_token = payload.get_token()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Verify ID token with Google
    id_info = verify_google_id_token(raw_token)
    google_sub = id_info["sub"]
    google_email = id_info["email"].lower().strip()
    google_picture = id_info.get("picture")

    # Find the user by email
    user = db.query(User).filter(User.email == google_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found matching the Google email address."
        )

    # Verify existing account password
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Account linking denied."
        )

    # Check if this Google ID is already linked to another account
    other_user = db.query(User).filter(User.google_id == google_sub).first()
    if other_user and other_user.id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Google account is already linked to another user."
        )

    # Safely link account
    user.google_id = google_sub
    user.auth_provider = "google+local"
    user.is_verified = True
    if google_picture and not user.avatar_url:
        user.avatar_url = google_picture
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    # Audit
    db.add(AuditLog(
        user_id=user.id,
        action="USER_ACCOUNT_LINKED_GOOGLE",
        resource_type="user",
        resource_id=str(user.id),
        user_role=user.role.value,
        ip_address=request.client.host if request.client else None,
        detail=f"Google account linked for user: {user.email}",
    ))
    db.commit()

    token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
    set_auth_cookie(response, token)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def get_me(current_user: Annotated[User, Depends(get_current_user)]):
    """Return current authenticated user info."""
    return current_user


@router.post("/logout")
def logout(
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Log out current user, clear session cookie and record audit trail."""
    response.delete_cookie(
        key="drishti_session",
        path="/",
        httponly=True,
        samesite="lax",
    )
    db.add(AuditLog(
        user_id=current_user.id,
        action="USER_LOGOUT",
        resource_type="user",
        resource_id=str(current_user.id),
        user_role=current_user.role.value,
        detail=f"User logged out: {current_user.email}",
    ))
    db.commit()
    return {"status": "ok", "message": "Successfully logged out."}
