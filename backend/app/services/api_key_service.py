from fastapi import status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import api_key_display_prefix, generate_api_key, hash_api_key, invalidate_family
from app.models.api_key import ApiKey
from app.models.refresh_token import RefreshToken

settings = get_settings()


class ApiKeyError(Exception):
    def __init__(self, status_code: int, error: str, error_description: str):
        self.status_code = status_code
        self.error = error
        self.error_description = error_description


def _fail(status_code: int, error: str, description: str) -> ApiKeyError:
    return ApiKeyError(status_code, error, description)


async def list_api_keys(db: AsyncSession, user_id: str) -> list[ApiKey]:
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc())
    )
    return list(result.scalars().all())


async def create_api_key(db: AsyncSession, user_id: str, name: str) -> tuple[ApiKey, str]:
    limit = settings.MAX_API_KEYS_PER_USER
    if len(await list_api_keys(db, user_id)) >= limit:
        raise _fail(status.HTTP_409_CONFLICT, "api_key_limit", f"No more than {limit} API keys per user.")
    raw_key = generate_api_key()
    api_key = ApiKey(user_id=user_id, name=name, prefix=api_key_display_prefix(raw_key), key_hash=hash_api_key(raw_key))
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    return api_key, raw_key


async def delete_api_key(db: AsyncSession, redis: Redis, user_id: str, key_id: str) -> None:
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id))
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise _fail(status.HTTP_404_NOT_FOUND, "api_key_not_found", "API key not found.")
    families = await db.execute(select(RefreshToken.family_id).where(RefreshToken.api_key_id == api_key.id))
    for family_id in set(families.scalars()):
        await invalidate_family(redis, family_id)
    await db.delete(api_key)
    await db.commit()


async def find_api_key(db: AsyncSession, raw_key: str) -> ApiKey | None:
    result = await db.execute(select(ApiKey).where(ApiKey.key_hash == hash_api_key(raw_key)))
    return result.scalar_one_or_none()


async def api_key_belongs_to(db: AsyncSession, key_id: str, user_id: str) -> bool:
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id))
    return result.scalar_one_or_none() is not None
