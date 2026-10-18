import hashlib
import secrets
from dataclasses import dataclass

from redis.asyncio import Redis

from app.config import get_settings

settings = get_settings()


@dataclass(frozen=True)
class TokenPurpose:
    name: str
    ttl_seconds: int
    single_active: bool


EMAIL_VERIFICATION = TokenPurpose("verify_email", settings.EMAIL_VERIFICATION_TTL_SECONDS, single_active=False)
PASSWORD_RESET = TokenPurpose("password_reset", settings.PASSWORD_RESET_TTL_SECONDS, single_active=True)


def _hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _token_key(purpose: TokenPurpose, token_hash: str) -> str:
    return f"email_token:{purpose.name}:{token_hash}"


def _current_key(purpose: TokenPurpose, user_id: str) -> str:
    return f"email_token_current:{purpose.name}:{user_id}"


async def issue(redis: Redis, purpose: TokenPurpose, user_id: str) -> str:
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash(raw_token)
    if purpose.single_active:
        await revoke(redis, purpose, user_id)
        await redis.set(_current_key(purpose, user_id), token_hash, ex=purpose.ttl_seconds)
    await redis.set(_token_key(purpose, token_hash), user_id, ex=purpose.ttl_seconds)
    return raw_token


async def consume(redis: Redis, purpose: TokenPurpose, raw_token: str) -> str | None:
    user_id = await redis.getdel(_token_key(purpose, _hash(raw_token)))
    if user_id and purpose.single_active:
        await redis.delete(_current_key(purpose, user_id))
    return user_id


async def revoke(redis: Redis, purpose: TokenPurpose, user_id: str) -> None:
    current_hash = await redis.getdel(_current_key(purpose, user_id))
    if current_hash:
        await redis.delete(_token_key(purpose, current_hash))
