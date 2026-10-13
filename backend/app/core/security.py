"""
Security module: OAuth2 password flow, JWT, refresh tokens, hashing.

Key concepts:
- Access token: JWT, 15 min, in Authorization: Bearer header
- Refresh token: opaque 32 bytes hex, SHA-256 hash in DB, raw token in httpOnly cookie
- Refresh family tracking: all refresh tokens in the same chain share a family_id.
  On rotation: old token → status "replaced", new token → status "active".
  On replay detection (old already-replaced token used again) → invalidate entire family.
"""

import asyncio
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from redis.asyncio import Redis

from app.config import get_settings

settings = get_settings()

BCRYPT_MAX_PASSWORD_BYTES = 72
BCRYPT_ROUNDS = 12

_DUMMY_PASSWORD_HASH = bcrypt.hashpw(secrets.token_bytes(16), bcrypt.gensalt(rounds=BCRYPT_ROUNDS))


async def hash_password(password: str) -> str:
    hashed = await asyncio.to_thread(bcrypt.hashpw, password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS))
    return hashed.decode("utf-8")


async def verify_password(plain_password: str, hashed_password: str) -> bool:
    return await asyncio.to_thread(bcrypt.checkpw, plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


async def burn_password_check(plain_password: str) -> None:
    await asyncio.to_thread(bcrypt.checkpw, plain_password.encode("utf-8"), _DUMMY_PASSWORD_HASH)


def create_access_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": secrets.token_hex(16),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def generate_refresh_token() -> str:
    return secrets.token_hex(settings.REFRESH_TOKEN_BYTES)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _family_key(family_id: str) -> str:
    return f"refresh_family:{family_id}"


def _family_ttl_seconds() -> int:
    return settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400


async def store_refresh_family(redis: Redis, family_id: str, token_jti: str, user_id: str) -> None:
    data = {"user_id": user_id, "tokens": [{"jti": token_jti, "status": "active"}]}
    await redis.set(_family_key(family_id), json.dumps(data), ex=_family_ttl_seconds())


_ROTATE_FAMILY_SCRIPT = """
local raw = redis.call('GET', KEYS[1])
if not raw then
  return false
end
local data = cjson.decode(raw)
local presented = nil
for _, token in ipairs(data.tokens) do
  if token.jti == ARGV[1] then
    presented = token
  end
end
if presented == nil or presented.status ~= 'active' then
  redis.call('DEL', KEYS[1])
  return 'replay'
end
presented.status = 'replaced'
table.insert(data.tokens, {jti = ARGV[2], status = 'active'})
redis.call('SET', KEYS[1], cjson.encode(data), 'EX', ARGV[3])
return data.user_id
"""


async def rotate_refresh_family(
    redis: Redis, family_id: str, presented_jti: str, new_jti: str
) -> Optional[str]:
    """Rotate a refresh token family atomically (single Lua script).

    Replay is decided by the status of the *presented* token: a family
    accumulates replaced tokens as a normal consequence of rotation.

    Returns:
        user_id  — rotation succeeded (presented token was active);
        "replay" — presented token was already replaced (or unknown to the
                   family) → the whole family is invalidated;
        None     — family does not exist (expired or already invalidated).
    """
    result = await redis.eval(
        _ROTATE_FAMILY_SCRIPT, 1, _family_key(family_id), presented_jti, new_jti, _family_ttl_seconds()
    )
    if isinstance(result, bytes):
        return result.decode("utf-8")
    return result


async def invalidate_family(redis: Redis, family_id: str) -> None:
    await redis.delete(_family_key(family_id))
