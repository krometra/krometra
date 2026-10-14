"""FastAPI dependencies: DB session, current user, Redis client."""

from __future__ import annotations

from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import Cookie, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import resolve_client_ip
from app.models.user import User
from app.services.auth_service import AuthError, AuthSession, get_current_session

settings = get_settings()
security_scheme = HTTPBearer(auto_error=False)


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """Provide a Redis client."""
    client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


async def get_auth_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> AuthSession:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "error_description": "Missing authorization header."},
        )
    try:
        return await get_current_session(db, credentials.credentials)
    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": e.error, "error_description": e.error_description},
        )


async def get_current_active_user(session: AuthSession = Depends(get_auth_session)) -> User:
    return session.user


async def get_password_session_user(session: AuthSession = Depends(get_auth_session)) -> User:
    if session.api_key_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "api_key_session_forbidden",
                "error_description": "API keys can only be managed from a password session.",
            },
        )
    return session.user


async def get_refresh_token_from_cookie(
    request: Request,
    refresh_token: str | None = Cookie(None, alias="refresh_token"),
) -> str:
    """Extract refresh token from httpOnly cookie."""
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_grant", "error_description": "No refresh token cookie."},
        )
    return refresh_token


def get_client_ip(request: Request) -> str:
    peer = request.client.host if request.client else None
    return resolve_client_ip(peer, request.headers, settings.TRUSTED_PROXIES)


async def get_storage():
    """Provide an AsyncStorageClient connected to MinIO."""
    from app.core.storage import AsyncStorageClient

    storage = AsyncStorageClient(
        endpoint=settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        bucket_name=settings.MINIO_BUCKET,
        secure=settings.MINIO_SECURE,
    )
    await storage.ensure_bucket()
    return storage
