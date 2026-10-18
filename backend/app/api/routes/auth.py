"""Authentication routes: OAuth2 password and API key flows, refresh, logout, me."""

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_client_ip,
    get_current_active_user,
    get_db,
    get_outbox,
    get_redis,
    get_refresh_token_from_cookie,
)
from app.config import get_settings
from app.core import rate_limit
from app.core.mailer import Outbox
from app.core.rate_limit import RateLimitExceeded
from app.models.user import User
from app.schemas.auth import RegisterRequest, RegisterResponse, TokenResponse, UserResponse
from app.services.account_service import send_verification_email
from app.services.admin_roles import ensure_listed_admin
from app.services.auth_service import (
    AuthError,
    authenticate_api_key_grant,
    authenticate_password_grant,
    refresh_access_token,
    register_user,
    revoke_all_user_tokens,
    revoke_refresh_token,
)

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])


def too_many_requests(e: RateLimitExceeded) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={"error": "rate_limited", "error_description": e.description},
        headers={"Retry-After": str(e.retry_after)},
    )


def _bad_request(error: str, description: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"error": error, "error_description": description},
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    outbox: Outbox = Depends(get_outbox),
):
    """Register a new user with email and password and send the verification email."""
    try:
        await rate_limit.consume(redis, rate_limit.REGISTER_BY_IP, client_ip)
        user = await register_user(db, data)
    except RateLimitExceeded as e:
        raise too_many_requests(e)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"error": e.error, "error_description": e.error_description})
    await send_verification_email(redis, outbox, user)
    return RegisterResponse(user=UserResponse.model_validate(user))


async def _password_grant(db: AsyncSession, redis: Redis, client_ip: str, username: str | None, password: str | None):
    if not username or not password:
        raise _bad_request("invalid_request", "username and password are required for password grant.")
    return await authenticate_password_grant(db, redis, username, password, client_ip)


async def _api_key_grant(db: AsyncSession, redis: Redis, client_ip: str, api_key: str | None):
    if not api_key:
        raise _bad_request("invalid_request", "api_key is required for api_key grant.")
    return await authenticate_api_key_grant(db, redis, api_key, client_ip)


async def _refresh_grant(request: Request, db: AsyncSession, redis: Redis, client_ip: str):
    raw_token = request.cookies.get("refresh_token")
    if not raw_token:
        raise _bad_request("invalid_request", "refresh_token cookie is required for refresh_token grant.")
    await rate_limit.consume(redis, rate_limit.REFRESH_BY_IP, client_ip)
    return await refresh_access_token(db, redis, raw_token)


@router.post("/token", response_model=TokenResponse)
async def token(
    request: Request,
    response: Response,
    grant_type: str = Form(...),
    username: str | None = Form(None),
    password: str | None = Form(None),
    api_key: str | None = Form(None),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """OAuth2 Token Endpoint (RFC 6749).

    Supports:
    - grant_type=password: email + password
    - grant_type=api_key: personal API key
    - grant_type=refresh_token: rotation of the refresh token from the httpOnly cookie
    """
    try:
        if grant_type == "password":
            access_token, refresh_token_raw = await _password_grant(db, redis, client_ip, username, password)
        elif grant_type == "api_key":
            access_token, refresh_token_raw = await _api_key_grant(db, redis, client_ip, api_key)
        elif grant_type == "refresh_token":
            access_token, refresh_token_raw = await _refresh_grant(request, db, redis, client_ip)
        else:
            raise _bad_request("unsupported_grant_type", f"Grant type '{grant_type}' is not supported.")
    except RateLimitExceeded as e:
        raise too_many_requests(e)
    except AuthError as e:
        raise _bad_request(e.error, e.error_description)

    return _issue_tokens(response, access_token, refresh_token_raw)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    raw_token: str = Depends(get_refresh_token_from_cookie),
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Refresh an access token using the refresh token from httpOnly cookie."""
    try:
        await rate_limit.consume(redis, rate_limit.REFRESH_BY_IP, client_ip)
        access_token, new_refresh_raw = await refresh_access_token(db, redis, raw_token)
    except RateLimitExceeded as e:
        raise too_many_requests(e)
    except AuthError as e:
        raise _bad_request(e.error, e.error_description)

    return _issue_tokens(response, access_token, new_refresh_raw)


# --- Logout ---


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    raw_token: str = Depends(get_refresh_token_from_cookie),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Logout: revoke refresh token and clear cookie."""
    await revoke_refresh_token(db, redis, raw_token)
    _clear_refresh_cookie(response)


# --- Logout All ---


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    response: Response,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Logout from all devices: revoke all refresh tokens for the user."""
    await revoke_all_user_tokens(db, redis, current_user.id)
    _clear_refresh_cookie(response)


# --- Current User ---


@router.get("/me", response_model=UserResponse)
async def me(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current authenticated user."""
    await ensure_listed_admin(db, current_user)
    return UserResponse.model_validate(current_user)


def _issue_tokens(response: Response, access_token: str, refresh_token_raw: str) -> TokenResponse:
    _set_refresh_cookie(response, refresh_token_raw)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Set the refresh token as an httpOnly Secure SameSite cookie."""
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        path="/api/auth",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Clear the refresh token cookie."""
    response.set_cookie(
        key="refresh_token",
        value="",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        path="/api/auth",
        max_age=0,
    )
