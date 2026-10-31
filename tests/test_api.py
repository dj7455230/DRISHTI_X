"""
DRISHTI-X — Tests: FastAPI Endpoints
Uses TestClient with full DB mocking — no live PostgreSQL needed.
"""
import sys, os
import pytest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Patch SQLAlchemy engine creation BEFORE importing the app
# so no real DB connection is attempted
_mock_engine = MagicMock()
_mock_session = MagicMock()
_mock_session_local = MagicMock(return_value=_mock_session)

with patch("sqlalchemy.create_engine", return_value=_mock_engine):
    with patch("sqlalchemy.orm.sessionmaker", return_value=_mock_session_local):
        from app.main import app
        from app.db.base import get_db


def override_get_db():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    db.query.return_value.filter.return_value.all.return_value = []
    db.query.return_value.scalar.return_value = 0
    yield db


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_health_endpoint(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["app"] == "DRISHTI-X"
    assert "model_status" in data
    assert "disclaimer" in data


def test_docs_endpoint(client):
    r = client.get("/api/docs")
    assert r.status_code == 200


def test_openapi_schema(client):
    r = client.get("/api/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    assert "paths" in schema
    # Verify key endpoints are registered
    assert "/api/auth/login" in schema["paths"]
    assert "/api/screenings" in schema["paths"]
    assert "/api/patients" in schema["paths"]


def test_login_invalid_credentials(client):
    r = client.post("/api/auth/login", json={
        "email": "noone@test.com",
        "password": "wrongpassword"
    })
    assert r.status_code == 401


def test_patients_requires_auth(client):
    r = client.get("/api/patients")
    assert r.status_code == 401


def test_screenings_requires_auth(client):
    r = client.get("/api/screenings")
    assert r.status_code == 401


def test_dashboard_requires_auth(client):
    r = client.get("/api/dashboard/statistics")
    assert r.status_code == 401


def test_audit_requires_auth(client):
    r = client.get("/api/audit")
    assert r.status_code == 401


def test_models_requires_auth(client):
    r = client.get("/api/models")
    assert r.status_code == 401
