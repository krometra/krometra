"""Чтение сохранённого меша тела."""

import json

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.models.project import Project
from app.schemas.geometry import MeshResponse
from app.schemas.ids import is_body_id

from .common import mesh_key


async def _require_project(project_id: str, user_id: str, db: AsyncSession) -> None:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")


async def get_mesh(
    project_id: str,
    body_id: str,
    user_id: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
) -> MeshResponse:
    """Return the tessellated mesh stored for a body."""
    await _require_project(project_id, user_id, db)

    blob = await storage.get_object(mesh_key(project_id, body_id)) if is_body_id(body_id) else None
    if blob:
        return MeshResponse(**json.loads(blob))

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "error": "mesh_not_found",
            "error_description": f"Mesh for body '{body_id}' not found.",
        },
    )
