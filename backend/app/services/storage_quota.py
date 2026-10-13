"""Квоты пользователя: число проектов и суммарный объём файлов в хранилище."""

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.storage import AsyncStorageClient
from app.models.project import Project


def max_projects_per_user() -> int:
    return get_settings().MAX_PROJECTS_PER_USER


def max_storage_bytes_per_user() -> int:
    return get_settings().MAX_STORAGE_BYTES_PER_USER


def _format_bytes(size: int) -> str:
    gigabytes = size / 1024 ** 3
    return f"{gigabytes:g} ГБ" if gigabytes >= 1 else f"{size / 1024 ** 2:g} МБ"


def project_prefix(project_id: str) -> str:
    return f"{project_id}/"


async def count_projects(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(select(func.count()).select_from(Project).where(Project.owner_id == user_id))
    return result.scalar_one()


async def used_storage_bytes(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        select(func.coalesce(func.sum(Project.storage_bytes), 0)).where(Project.owner_id == user_id)
    )
    return int(result.scalar_one())


async def ensure_storage_quota(db: AsyncSession, user_id: str, added_bytes: int) -> None:
    if added_bytes <= 0:
        return
    limit = max_storage_bytes_per_user()
    if await used_storage_bytes(db, user_id) + added_bytes > limit:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "error": "storage_quota_exceeded",
                "error_description": f"Превышена квота хранилища: {_format_bytes(limit)} на пользователя. Удалите ненужные проекты.",
            },
        )


async def refresh_project_usage(db: AsyncSession, storage: AsyncStorageClient, project_id: str) -> None:
    size = await storage.prefix_size(project_prefix(project_id))
    await db.execute(update(Project).where(Project.id == project_id).values(storage_bytes=size, updated_at=Project.updated_at))
    await db.commit()
