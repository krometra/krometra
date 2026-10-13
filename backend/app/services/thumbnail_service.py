"""Превью проекта: PNG, снятый клиентом с вьюпорта, хранится как есть."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.services.project_service import ProjectError, get_project
from app.services.storage_quota import ensure_storage_quota, refresh_project_usage

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_THUMBNAIL_BYTES = 512 * 1024


def thumbnail_key(project_id: str) -> str:
    return f"{project_id}/thumbnail.png"


def validated_thumbnail(png: bytes) -> bytes:
    if not png.startswith(PNG_SIGNATURE):
        raise ProjectError(400, "Превью должно быть PNG-изображением.")
    if len(png) > MAX_THUMBNAIL_BYTES:
        raise ProjectError(413, "Превью больше 512 КБ.")
    return png


async def save_thumbnail(
    db: AsyncSession, project_id: str, user_id: str, png: bytes, storage: AsyncStorageClient
) -> None:
    await get_project(db, project_id, user_id)
    image = validated_thumbnail(png)
    await ensure_storage_quota(db, user_id, len(image))
    await storage.put_object(thumbnail_key(project_id), image, "image/png")
    await refresh_project_usage(db, storage, project_id)


async def delete_thumbnail(
    db: AsyncSession, project_id: str, user_id: str, storage: AsyncStorageClient
) -> None:
    await get_project(db, project_id, user_id)
    if await storage.object_exists(thumbnail_key(project_id)):
        await storage.delete_object(thumbnail_key(project_id))


async def load_thumbnail(
    db: AsyncSession, project_id: str, user_id: str, storage: AsyncStorageClient
) -> bytes | None:
    await get_project(db, project_id, user_id)
    key = thumbnail_key(project_id)
    if not await storage.object_exists(key):
        return None
    return await storage.get_object(key)
