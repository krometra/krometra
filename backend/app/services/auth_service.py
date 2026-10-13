"""
Authentication service: registration, OAuth2 password flow, refresh token rotation, revocation.
"""

import secrets
from datetime import datetime, timedelta, timezone

import jwt
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core import rate_limit
from app.core.security import (
    burn_password_check,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    invalidate_family,
    rotate_refresh_family,
    store_refresh_family,
    verify_password,
)
from app.models.base import new_uuid
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import RegisterRequest, normalize_email

settings = get_settings()


class AuthError(Exception):
    def __init__(self, error: str, error_description: str = ""):
        self.error = error
        self.error_description = error_description


async def _find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).where(func.lower(User.email) == normalize_email(email)).order_by(User.created_at).limit(1)
    )
    return result.scalar_one_or_none()


async def register_user(db: AsyncSession, data: RegisterRequest) -> User:
    if await _find_user_by_email(db, data.email):
        raise AuthError("email_taken", "A user with this email already exists.")

    user = User(
        email=data.email,
        password_hash=await hash_password(data.password),
        display_name=data.display_name or data.email,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _check_credentials(db: AsyncSession, email: str, password: str) -> User | None:
    user = await _find_user_by_email(db, email)
    if not user or not user.password_hash:
        await burn_password_check(password)
        return None
    if not await verify_password(password, user.password_hash):
        return None
    return user


async def authenticate_password_grant(
    db: AsyncSession,
    redis: Redis,
    email: str,
    password: str,
    client_ip: str,
) -> tuple[str, str]:
    """Authenticate using OAuth2 password grant.

    Returns (access_token, refresh_token_raw).
    Raises AuthError on bad credentials, RateLimitExceeded after too many failures
    from one IP or for one email.
    """
    email_key = normalize_email(email)
    await rate_limit.ensure_available(redis, rate_limit.LOGIN_FAILURES_BY_IP, client_ip)
    await rate_limit.ensure_available(redis, rate_limit.LOGIN_FAILURES_BY_EMAIL, email_key)

    user = await _check_credentials(db, email, password)
    if not user:
        await rate_limit.consume(redis, rate_limit.LOGIN_FAILURES_BY_IP, client_ip)
        await rate_limit.consume(redis, rate_limit.LOGIN_FAILURES_BY_EMAIL, email_key)
        raise AuthError("invalid_grant", "Invalid credentials.")
    await rate_limit.reset(redis, rate_limit.LOGIN_FAILURES_BY_EMAIL, email_key)

    access_token = create_access_token(user.id, user.email)

    refresh_token_raw = generate_refresh_token()
    family_id = secrets.token_hex(16)

    # id is generated up front: the model default only applies on flush, so
    # db_token.id would still be None when the family is written to Redis.
    token_id = new_uuid()
    db.add(RefreshToken(
        id=token_id,
        user_id=user.id,
        token_hash=hash_refresh_token(refresh_token_raw),
        family_id=family_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    ))
    await store_refresh_family(redis, family_id, token_id, user.id)

    await db.commit()
    return access_token, refresh_token_raw


async def refresh_access_token(
    db: AsyncSession,
    redis: Redis,
    refresh_token_raw: str,
) -> tuple[str, str]:
    """Refresh an access token using a refresh token.
    
    Implements full rotation: old token invalidated, new token issued.
    Family tracking: if a replaced token is reused → entire family invalidated.
    
    Returns (new_access_token, new_refresh_token_raw).
    Raises AuthError on failure.
    """
    refresh_hash = hash_refresh_token(refresh_token_raw)

    # Look the token up regardless of `revoked`: a revoked token being
    # presented again is exactly the replay case, and it must invalidate the
    # whole family. Filtering it out here would make replay indistinguishable
    # from an unknown token and leave the leaked family alive.
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == refresh_hash)
    )
    db_token = result.scalar_one_or_none()

    if not db_token:
        raise AuthError("invalid_grant", "Invalid or expired refresh token.")

    async def _revoke_family(family_id: str) -> None:
        all_tokens = await db.execute(
            select(RefreshToken).where(RefreshToken.family_id == family_id)
        )
        for t in all_tokens.scalars():
            t.revoked = True
        await invalidate_family(redis, family_id)
        await db.commit()

    if db_token.revoked:
        await _revoke_family(db_token.family_id)
        raise AuthError("invalid_grant", "Security violation detected. All sessions revoked.")

    if db_token.expires_at < datetime.now(timezone.utc):
        raise AuthError("invalid_grant", "Refresh token has expired.")

    # Rotate the family: the presented token must be the active one.
    # new_token_id is generated up front so Redis and the DB row share an id.
    new_token_id = new_uuid()
    family_result = await rotate_refresh_family(
        redis, db_token.family_id, db_token.id, new_token_id
    )
    if family_result == "replay":
        # Replay detected in Redis — invalidate the entire family.
        await _revoke_family(db_token.family_id)
        raise AuthError("invalid_grant", "Security violation detected. All sessions revoked.")

    # Revoke old token
    db_token.revoked = True

    # Get user
    result = await db.execute(select(User).where(User.id == db_token.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise AuthError("invalid_grant", "User not found.")

    # Create new access token
    access_token = create_access_token(user.id, user.email)

    # Create new refresh token (rotation)
    new_refresh_raw = generate_refresh_token()
    new_refresh_hash = hash_refresh_token(new_refresh_raw)
    new_db_token = RefreshToken(
        id=new_token_id,
        user_id=user.id,
        token_hash=new_refresh_hash,
        family_id=db_token.family_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_db_token)

    await db.commit()
    return access_token, new_refresh_raw


async def revoke_refresh_token(db: AsyncSession, redis: Redis, refresh_token_raw: str) -> None:
    """Revoke a specific refresh token and invalidate its entire family (logout all devices)."""
    refresh_hash = hash_refresh_token(refresh_token_raw)

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == refresh_hash)
    )
    db_token = result.scalar_one_or_none()

    if db_token:
        # Invalidate the entire family in Redis
        await invalidate_family(redis, db_token.family_id)

        # Mark all tokens in the family as revoked
        all_tokens = await db.execute(
            select(RefreshToken).where(RefreshToken.family_id == db_token.family_id)
        )
        for t in all_tokens.scalars():
            t.revoked = True
        await db.commit()


async def revoke_all_user_tokens(db: AsyncSession, redis: Redis, user_id: str) -> None:
    """Revoke all refresh tokens for a user (logout from all devices)."""
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked == False,  # noqa: E712
        )
    )
    for token in result.scalars():
        await invalidate_family(redis, token.family_id)
        token.revoked = True
    await db.commit()


async def get_current_user(db: AsyncSession, token: str) -> User:
    """Get the current user from an access token."""
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise AuthError("invalid_token", "Access token has expired.")
    except jwt.PyJWTError:
        raise AuthError("invalid_token", "Invalid access token.")
    if payload.get("type") != "access":
        raise AuthError("invalid_token", "Invalid token type.")
    user_id = payload.get("sub")
    if not user_id:
        raise AuthError("invalid_token", "Invalid token payload.")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise AuthError("invalid_token", "User not found.")
    return user
