"""Email-driven account flows: email verification, password reset and password change."""

from fastapi import status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import email_tokens, rate_limit
from app.core.mailer import Outbox
from app.core.rate_limit import RateLimitExceeded
from app.core.security import hash_password, verify_password
from app.models.base import utcnow
from app.models.user import User
from app.schemas.auth import normalize_email
from app.services.account_emails import password_changed_email, password_reset_email, verification_email
from app.services.auth_service import (
    find_user_by_email,
    find_user_by_id,
    revoke_all_user_tokens,
    revoke_other_user_tokens,
)


class AccountError(Exception):
    def __init__(self, status_code: int, error: str, error_description: str):
        self.status_code = status_code
        self.error = error
        self.error_description = error_description


def _invalid_token() -> AccountError:
    return AccountError(
        status.HTTP_400_BAD_REQUEST, "invalid_token", "Ссылка недействительна или устарела."
    )


async def send_verification_email(redis: Redis, outbox: Outbox, user: User) -> None:
    raw_token = await email_tokens.issue(redis, email_tokens.EMAIL_VERIFICATION, user.id)
    outbox.send(verification_email(user.email, raw_token))


async def resend_verification_email(redis: Redis, outbox: Outbox, user: User) -> None:
    if user.email_verified:
        raise AccountError(status.HTTP_409_CONFLICT, "email_already_verified", "Почта уже подтверждена.")
    await rate_limit.consume(redis, rate_limit.VERIFY_RESEND_BY_USER, user.id)
    await send_verification_email(redis, outbox, user)


async def _user_by_token(db: AsyncSession, redis: Redis, purpose: email_tokens.TokenPurpose, raw_token: str) -> User:
    user_id = await email_tokens.consume(redis, purpose, raw_token)
    user = await find_user_by_id(db, user_id) if user_id else None
    if user is None:
        raise _invalid_token()
    return user


def _mark_verified(user: User) -> None:
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()


async def verify_email(db: AsyncSession, redis: Redis, raw_token: str, client_ip: str) -> None:
    await rate_limit.consume(redis, rate_limit.VERIFY_EMAIL_BY_IP, client_ip)
    user = await _user_by_token(db, redis, email_tokens.EMAIL_VERIFICATION, raw_token)
    _mark_verified(user)
    await db.commit()


async def request_password_reset(db: AsyncSession, redis: Redis, outbox: Outbox, email: str, client_ip: str) -> None:
    await rate_limit.consume(redis, rate_limit.FORGOT_PASSWORD_BY_IP, client_ip)
    try:
        await rate_limit.consume(redis, rate_limit.FORGOT_PASSWORD_BY_EMAIL, normalize_email(email))
    except RateLimitExceeded:
        return
    user = await find_user_by_email(db, email)
    if user is None:
        return
    raw_token = await email_tokens.issue(redis, email_tokens.PASSWORD_RESET, user.id)
    outbox.send(password_reset_email(user.email, raw_token))


async def reset_password(
    db: AsyncSession, redis: Redis, outbox: Outbox, raw_token: str, new_password: str, client_ip: str
) -> None:
    await rate_limit.consume(redis, rate_limit.RESET_PASSWORD_BY_IP, client_ip)
    user = await _user_by_token(db, redis, email_tokens.PASSWORD_RESET, raw_token)
    user.password_hash = await hash_password(new_password)
    _mark_verified(user)
    await revoke_all_user_tokens(db, redis, user.id)
    await rate_limit.reset(redis, rate_limit.LOGIN_FAILURES_BY_EMAIL, normalize_email(user.email))
    outbox.send(password_changed_email(user.email))


async def _check_current_password(redis: Redis, user: User, current_password: str) -> None:
    if not user.password_hash:
        raise AccountError(
            status.HTTP_400_BAD_REQUEST,
            "password_not_set",
            "У аккаунта нет пароля: задайте его через восстановление по почте.",
        )
    await rate_limit.ensure_available(redis, rate_limit.PASSWORD_CHANGE_FAILURES_BY_USER, user.id)
    if not await verify_password(current_password, user.password_hash):
        await rate_limit.consume(redis, rate_limit.PASSWORD_CHANGE_FAILURES_BY_USER, user.id)
        raise AccountError(status.HTTP_400_BAD_REQUEST, "invalid_current_password", "Текущий пароль неверен.")
    await rate_limit.reset(redis, rate_limit.PASSWORD_CHANGE_FAILURES_BY_USER, user.id)


async def change_password(
    db: AsyncSession,
    redis: Redis,
    outbox: Outbox,
    user: User,
    current_password: str,
    new_password: str,
    current_refresh_raw: str | None,
) -> None:
    await _check_current_password(redis, user, current_password)
    user.password_hash = await hash_password(new_password)
    await email_tokens.revoke(redis, email_tokens.PASSWORD_RESET, user.id)
    await revoke_other_user_tokens(db, redis, user.id, current_refresh_raw)
    outbox.send(password_changed_email(user.email))
