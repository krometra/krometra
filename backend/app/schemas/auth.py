from datetime import datetime
from typing import Annotated, Optional

from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator

from app.core.security import BCRYPT_MAX_PASSWORD_BYTES


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _fits_bcrypt(value: str) -> str:
    if len(value.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(
            f"Пароль длиннее {BCRYPT_MAX_PASSWORD_BYTES} байт в UTF-8 — сократите его "
            "(кириллица и эмодзи занимают 2–4 байта на символ)."
        )
    return value


def _normalize_email_input(value: object) -> object:
    return normalize_email(value) if isinstance(value, str) else value


NewPassword = Annotated[str, Field(min_length=8), AfterValidator(_fits_bcrypt)]
EmailToken = Annotated[str, Field(min_length=1, max_length=128)]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: NewPassword
    display_name: Optional[str] = Field(None, max_length=100)

    _normalize_email = field_validator("email", mode="before")(_normalize_email_input)


class VerifyEmailRequest(BaseModel):
    token: EmailToken


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    _normalize_email = field_validator("email", mode="before")(_normalize_email_input)


class ResetPasswordRequest(BaseModel):
    token: EmailToken
    new_password: NewPassword


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: NewPassword


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None
    is_admin: bool = False
    email_verified: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class RegisterResponse(BaseModel):
    user: UserResponse


# --- Token ---


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ErrorResponse(BaseModel):
    error: str
    error_description: Optional[str] = None
