"""
DRISHTI-X — Google OAuth & ID Token Verification Service
Verifies Google Identity Services ID tokens using official Google Auth library.
"""
from typing import Dict, Any, Optional
from fastapi import HTTPException, status, Request
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from google.auth.exceptions import GoogleAuthError

from app.core.config import settings

# Cached Google HTTP request adapter
_google_request_adapter = google_requests.Request()


def verify_google_id_token(token: str) -> Dict[str, Any]:
    """
    Verify and decode a Google ID token (JWT) using Google's public keys.

    Validates:
    - Signature against Google's public certs
    - Expiration (exp)
    - Audience (aud) matches settings.GOOGLE_CLIENT_ID
    - Issuer (iss) is accounts.google.com or https://accounts.google.com
    - Required claims: sub, email, email_verified
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured on this server (GOOGLE_CLIENT_ID missing)."
        )

    if not token or not isinstance(token, str) or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google token is missing or invalid."
        )

    token = token.strip()
    valid_audiences = [
        c.strip().strip("'\"")
        for c in settings.GOOGLE_CLIENT_ID.split(",")
        if c.strip().strip("'\"")
    ]
    if not valid_audiences:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured on this server (GOOGLE_CLIENT_ID empty)."
        )

    primary_audience = valid_audiences[0] if len(valid_audiences) == 1 else None

    try:
        # Verify the token with Google
        id_info = google_id_token.verify_oauth2_token(
            token,
            _google_request_adapter,
            audience=primary_audience,
            clock_skew_in_seconds=60
        )
    except ValueError as e:
        # Specific token validation failures (expired, bad signature, audience mismatch, etc.)
        err_msg = str(e).lower()
        if "expired" in err_msg or "too late" in err_msg:
            detail = "Google token has expired. Please sign in again."
        elif "audience" in err_msg or "recipient" in err_msg or "wrong recipient" in err_msg:
            detail = f"Google token audience mismatch. Configured: {', '.join(valid_audiences)}"
        else:
            detail = f"Invalid Google token: {str(e)}"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        )
    except GoogleAuthError as e:
        # Network error or Google certificate service unreachable
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to contact Google Identity Services to verify token. Please check internet connection."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google token verification failed: {str(e)}"
        )

    # 1. Validate Issuer
    iss = id_info.get("iss")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token issuer."
        )

    # 2. Validate Audience
    aud = id_info.get("aud")
    aud_matched = False
    if isinstance(aud, str):
        aud_matched = aud in valid_audiences
    elif isinstance(aud, (list, tuple)):
        aud_matched = any(a in valid_audiences for a in aud)

    if not aud_matched:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google token audience mismatch. Configured: {', '.join(valid_audiences)}, received: {aud}",
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        )

    # 3. Validate Required Claims
    sub = id_info.get("sub")
    email = id_info.get("email")
    if not sub or not isinstance(sub, str) or not sub.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google token is missing the required 'sub' subject claim."
        )

    if not email or not isinstance(email, str) or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google token is missing a valid 'email' claim."
        )

    # 4. Validate Email Verified
    email_verified = id_info.get("email_verified")
    if email_verified is not True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account email is not verified. Please verify your email with Google."
        )

    return id_info


def verify_csrf_token_if_present(request: Request, body_csrf: Optional[str] = None) -> None:
    """
    If GIS One Tap or redirect sends a g_csrf_token cookie and body parameter,
    verify that they match to prevent Cross-Site Request Forgery.
    """
    cookie_csrf = request.cookies.get("g_csrf_token")
    if cookie_csrf or body_csrf:
        if not cookie_csrf or not body_csrf or cookie_csrf != body_csrf:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CSRF token validation failed for Google Sign-In."
            )

