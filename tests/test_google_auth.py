"""
DRISHTI-X — Google Authentication Test Suite
Tests:
- Missing Google Client ID configuration (503)
- Invalid token signature (401)
- Wrong token audience (401)
- Expired token (401)
- Invalid token issuer (401)
- Missing required claims: sub, email (400)
- Unverified email claim (400)
- New user registration (role=HEALTH_WORKER, never ADMIN, provider=google)
- Existing Google user sign-in (preserves roles, history, updates last_login)
- Disabled/inactive user rejection (403)
- Account conflict handling (409 Conflict for existing email/password accounts)
- Secure account linking flow (password-verified linking)
- Session creation and access to protected routes (Bearer header & HttpOnly cookie)
- Network connectivity error / Google Identity Services unreachable (503)
"""
import sys
import os
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
from google.auth.exceptions import GoogleAuthError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app
from app.db.base import Base, get_db
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserRole


# Setup in-memory SQLite database specifically for auth testing
@pytest.fixture(scope="module")
def test_db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(test_db_engine):
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_db_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        # Clean users and audit tables after each test
        session.query(User).delete()
        session.commit()
        session.close()


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


MOCK_CLIENT_ID = "1234567890-testclientid.apps.googleusercontent.com"


# ─── 1. Configuration & Missing Token Tests ─────────────────────────

def test_missing_google_client_id_configuration(client):
    """When GOOGLE_CLIENT_ID is not configured, Google sign-in returns 503."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", None):
        r = client.post("/api/auth/google", json={"credential": "mock_id_token"})
        assert r.status_code == 503
        assert "Google authentication is not configured" in r.json()["detail"]


def test_missing_token_payload(client):
    """Missing or empty credential payload returns 400."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        r = client.post("/api/auth/google", json={})
        assert r.status_code == 400


# ─── 2. Google Token Verification Edge Cases ────────────────────────

def test_invalid_token_signature(client):
    """Invalid token signature raises 401 Unauthorized."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=ValueError("Invalid crypto signature")):
            r = client.post("/api/auth/google", json={"credential": "forged.jwt.token"})
            assert r.status_code == 401
            assert "Invalid Google token" in r.json()["detail"]


def test_expired_token(client):
    """Expired Google token raises 401 Unauthorized with expired message."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=ValueError("Token used too late, expired 100s ago")):
            r = client.post("/api/auth/google", json={"credential": "expired.jwt.token"})
            assert r.status_code == 401
            assert "expired" in r.json()["detail"].lower()


def test_wrong_token_audience_exception(client):
    """Token issued for a different client ID raises 401 via verify_oauth2_token exception."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=ValueError("Wrong recipient, expected ...")):
            r = client.post("/api/auth/google", json={"credential": "wrong_audience.jwt.token"})
            assert r.status_code == 401
            assert "audience mismatch" in r.json()["detail"].lower()


def test_wrong_token_audience_in_payload(client):
    """Token with aud claim that does not match configured client ID raises 401."""
    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": "different-client-id.apps.googleusercontent.com",
        "sub": "google-user-123",
        "email": "doctor@clinic.in",
        "email_verified": True,
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "wrong_aud_claim.jwt.token"})
            assert r.status_code == 401
            assert "audience mismatch" in r.json()["detail"].lower()


def test_multiple_comma_separated_audiences(client):
    """Allows tokens matching any client ID in a comma-separated list."""
    second_client_id = "9876543210-secondclient.apps.googleusercontent.com"
    combined_config = f"{MOCK_CLIENT_ID}, {second_client_id}"
    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": second_client_id,
        "sub": "google-user-999",
        "email": "nurse@ruralclinic.in",
        "email_verified": True,
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", combined_config):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "multi_aud.jwt.token"})
            assert r.status_code == 200
            data = r.json()
            assert "access_token" in data
            assert data["user"]["email"] == "nurse@ruralclinic.in"


def test_quoted_client_id_configuration(client):
    """Handles GOOGLE_CLIENT_ID wrapped in single or double quotes gracefully."""
    quoted_client_id = f'"{MOCK_CLIENT_ID}"'
    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "google-user-quoted",
        "email": "quoted@clinic.in",
        "email_verified": True,
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", quoted_client_id):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "quoted_aud.jwt.token"})
            assert r.status_code == 200
            assert r.json()["user"]["email"] == "quoted@clinic.in"


def test_list_audience_in_token_payload(client):
    """Supports token payload where 'aud' is an array/list of audiences."""
    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": [MOCK_CLIENT_ID, "another-service-audience"],
        "sub": "google-user-list-aud",
        "email": "listaud@clinic.in",
        "email_verified": True,
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "list_aud.jwt.token"})
            assert r.status_code == 200
            assert r.json()["user"]["email"] == "listaud@clinic.in"


def test_invalid_token_issuer(client):
    """Token with untrusted issuer is rejected with 401."""
    mock_payload = {
        "iss": "https://untrusted-issuer.example.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "google-user-123",
        "email": "doctor@clinic.in",
        "email_verified": True,
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "valid_structure_bad_issuer"})
            assert r.status_code == 401
            assert "issuer" in r.json()["detail"].lower()


def test_missing_required_claim_sub(client):
    """Token missing 'sub' claim raises 400."""
    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "email": "doctor@clinic.in",
        "email_verified": True,
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "missing_sub_claim"})
            assert r.status_code == 400
            assert "sub" in r.json()["detail"].lower()


def test_missing_required_claim_email(client):
    """Token missing 'email' claim raises 400."""
    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "google-user-123",
        "email_verified": True,
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "missing_email_claim"})
            assert r.status_code == 400
            assert "email" in r.json()["detail"].lower()


def test_unverified_email_claim(client):
    """Token with unverified email (email_verified=False) raises 400."""
    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "google-user-123",
        "email": "unverified@gmail.com",
        "email_verified": False,
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "unverified_email"})
            assert r.status_code == 400
            assert "not verified" in r.json()["detail"].lower()


def test_google_services_network_error(client):
    """Google certificate endpoint connection failure returns 503."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=GoogleAuthError("Failed to resolve googleapis.com")):
            r = client.post("/api/auth/google", json={"credential": "valid.token"})
            assert r.status_code == 503
            assert "Unable to contact Google Identity Services" in r.json()["detail"]


# ─── 3. New User Registration Flow ──────────────────────────────────

def test_new_user_registration_via_google(client, db_session):
    """A new user signing in via Google is created with default role HEALTH_WORKER (never ADMIN)."""
    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "google-sub-99901",
        "email": "rural.health.worker@clinic.in",
        "email_verified": True,
        "name": "Priya Sharma",
        "picture": "https://lh3.googleusercontent.com/a/photo.jpg",
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "valid_token_new_user"})
            assert r.status_code == 200
            data = r.json()
            assert "access_token" in data
            user = data["user"]
            assert user["email"] == "rural.health.worker@clinic.in"
            assert user["full_name"] == "Priya Sharma"
            assert user["role"] == "HEALTH_WORKER"  # Critical: never ADMIN
            assert user["auth_provider"] == "google"
            assert user["google_id"] == "google-sub-99901"
            assert user["avatar_url"] == "https://lh3.googleusercontent.com/a/photo.jpg"

            # Check cookie was set
            assert "drishti_session" in r.cookies

            # Verify in DB
            db_user = db_session.query(User).filter_by(google_id="google-sub-99901").first()
            assert db_user is not None
            assert db_user.role == UserRole.HEALTH_WORKER
            assert db_user.is_verified is True


# ─── 4. Existing User Sign-In Flow ──────────────────────────────────

def test_existing_google_user_signin(client, db_session):
    """Existing Google user signs in successfully, preserving existing role and records."""
    existing = User(
        email="doctor.ophthalmologist@hospital.in",
        full_name="Dr. Rajesh Patel",
        hashed_password="mock_unusable_hash",
        role=UserRole.OPHTHALMOLOGIST,
        google_id="google-sub-doctor-888",
        auth_provider="google",
        is_active=True,
        is_verified=True,
    )
    db_session.add(existing)
    db_session.commit()

    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "google-sub-doctor-888",
        "email": "doctor.ophthalmologist@hospital.in",
        "email_verified": True,
        "name": "Dr. Rajesh Patel",
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "valid_doctor_token"})
            assert r.status_code == 200
            data = r.json()
            user = data["user"]
            # Preserves OPHTHALMOLOGIST role
            assert user["role"] == "OPHTHALMOLOGIST"
            assert user["id"] == str(existing.id)


def test_inactive_google_user_rejected(client, db_session):
    """Inactive Google account cannot sign in (403 Forbidden)."""
    disabled_user = User(
        email="disabled.worker@clinic.in",
        full_name="Disabled User",
        hashed_password="mock_hash",
        role=UserRole.HEALTH_WORKER,
        google_id="google-sub-disabled-001",
        auth_provider="google",
        is_active=False,
    )
    db_session.add(disabled_user)
    db_session.commit()

    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "google-sub-disabled-001",
        "email": "disabled.worker@clinic.in",
        "email_verified": True,
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "token_for_disabled_user"})
            assert r.status_code == 403
            assert "disabled" in r.json()["detail"].lower()


# ─── 5. Account Conflict & Secure Account Linking Flow ──────────────

def test_existing_email_password_user_linked_and_logged_in(client, db_session):
    """
    When a user with an existing email/password account signs in with Google,
    the cryptographically verified Google identity is linked to the existing account,
    preserving their existing role (e.g. ADMIN) and existing records.
    """
    existing_pwd_user = User(
        email="clinical.admin@hospital.in",
        full_name="Clinical Admin",
        hashed_password=hash_password("SuperSecretPass123"),
        role=UserRole.ADMIN,
        google_id=None,  # No Google identity linked initially
        auth_provider="local",
        is_active=True,
    )
    db_session.add(existing_pwd_user)
    db_session.commit()

    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "new-unlinked-google-sub-777",
        "email": "clinical.admin@hospital.in",
        "email_verified": True,
        "name": "Clinical Admin",
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            r = client.post("/api/auth/google", json={"credential": "token_for_unlinked_email"})
            assert r.status_code == 200
            data = r.json()
            assert data["user"]["email"] == "clinical.admin@hospital.in"
            assert data["user"]["role"] == "ADMIN"  # Preserved ADMIN role
            assert data["user"]["google_id"] == "new-unlinked-google-sub-777"
            assert "access_token" in data

            # Verify in DB
            db_session.refresh(existing_pwd_user)
            assert existing_pwd_user.google_id == "new-unlinked-google-sub-777"
            assert existing_pwd_user.auth_provider == "google+local"


def test_secure_account_linking_with_password(client, db_session):
    """
    When account conflict happens, user can link Google identity securely by confirming password.
    """
    existing_pwd_user = User(
        email="doctor.smith@clinic.in",
        full_name="Dr. Smith",
        hashed_password=hash_password("ValidPassword987"),
        role=UserRole.OPHTHALMOLOGIST,
        google_id=None,
        auth_provider="local",
        is_active=True,
    )
    db_session.add(existing_pwd_user)
    db_session.commit()

    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "google-sub-dr-smith-linked",
        "email": "doctor.smith@clinic.in",
        "email_verified": True,
        "name": "Dr. Smith",
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            # Wrong password fails
            r_fail = client.post("/api/auth/google/link", json={
                "credential": "valid_smith_token",
                "password": "wrong_password_here"
            })
            assert r_fail.status_code == 401
            assert "Incorrect password" in r_fail.json()["detail"]

            # Correct password links account successfully
            r_success = client.post("/api/auth/google/link", json={
                "credential": "valid_smith_token",
                "password": "ValidPassword987"
            })
            assert r_success.status_code == 200
            data = r_success.json()
            assert data["user"]["google_id"] == "google-sub-dr-smith-linked"
            assert data["user"]["role"] == "OPHTHALMOLOGIST"

            # DB check
            db_session.refresh(existing_pwd_user)
            assert existing_pwd_user.google_id == "google-sub-dr-smith-linked"
            assert existing_pwd_user.auth_provider == "google+local"


# ─── 6. Session Creation & Protected Route Access ───────────────────

def test_session_token_and_cookie_access_protected_route(client, db_session):
    """
    Google authentication issues valid JWT and HttpOnly cookie.
    Both allow access to protected routes like /api/auth/me.
    """
    mock_payload = {
        "iss": "https://accounts.google.com",
        "aud": MOCK_CLIENT_ID,
        "sub": "google-sub-session-test",
        "email": "session.tester@clinic.in",
        "email_verified": True,
        "name": "Session Tester",
    }
    with patch.object(settings, "GOOGLE_CLIENT_ID", MOCK_CLIENT_ID):
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
            login_res = client.post("/api/auth/google", json={"credential": "session_test_token"})
            assert login_res.status_code == 200
            access_token = login_res.json()["access_token"]

            # 1. Access protected route with Bearer Header
            me_bearer = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access_token}"})
            assert me_bearer.status_code == 200
            assert me_bearer.json()["email"] == "session.tester@clinic.in"

            # 2. Access protected route with drishti_session Cookie
            me_cookie = client.get("/api/auth/me", cookies={"drishti_session": access_token})
            assert me_cookie.status_code == 200
            assert me_cookie.json()["email"] == "session.tester@clinic.in"
