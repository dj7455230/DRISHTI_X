from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
import uuid
from app.models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.HEALTH_WORKER
    facility_name: Optional[str] = None
    facility_location: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    facility_name: Optional[str] = None
    facility_location: Optional[str] = None
    auth_provider: Optional[str] = "local"
    google_id: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = None
    id_token: Optional[str] = None

    def get_token(self) -> str:
        token = self.credential or self.id_token
        if not token:
            raise ValueError("Either 'credential' or 'id_token' is required.")
        return token


class GoogleLinkRequest(BaseModel):
    credential: Optional[str] = None
    id_token: Optional[str] = None
    password: str

    def get_token(self) -> str:
        token = self.credential or self.id_token
        if not token:
            raise ValueError("Either 'credential' or 'id_token' is required.")
        return token
