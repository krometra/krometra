"""Project service: CRUD with user isolation."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.models.project import Project
from app.models.document import Document
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.storage_quota import count_projects, max_projects_per_user, project_prefix


class ProjectError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


async def list_projects(db: AsyncSession, user_id: str) -> list[Project]:
    """List all projects owned by the user."""
    result = await db.execute(
        select(Project)
        .where(Project.owner_id == user_id)
        .order_by(Project.updated_at.desc())
    )
    return list(result.scalars().all())


async def create_project(db: AsyncSession, user_id: str, data: ProjectCreate) -> Project:
    """Create a new project for the user, with an empty document."""
    limit = max_projects_per_user()
    if await count_projects(db, user_id) >= limit:
        raise ProjectError(403, f"Достигнут лимит: не больше {limit} проектов на пользователя. Удалите ненужные проекты.")
    project = Project(
        owner_id=user_id,
        name=data.name,
        description=data.description,
    )
    db.add(project)
    await db.flush()

    # Create empty document in the same transaction
    document = Document(
        project_id=project.id,
        components={},
        timeline=[],
        doc_metadata={},
        version=1,
    )
    db.add(document)
    await db.commit()
    await db.refresh(project)
    return project


async def get_project(db: AsyncSession, project_id: str, user_id: str) -> Project:
    """Get a project by ID, verifying ownership."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise ProjectError(404, "Project not found.")
    return project


async def update_project(
    db: AsyncSession, project_id: str, user_id: str, data: ProjectUpdate
) -> Project:
    """Update a project (rename, description)."""
    project = await get_project(db, project_id, user_id)
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    await db.commit()
    await db.refresh(project)
    return project


async def delete_project(db: AsyncSession, project_id: str, user_id: str, storage: AsyncStorageClient) -> None:
    """Delete a project and all associated data."""
    project = await get_project(db, project_id, user_id)
    await db.delete(project)
    await db.commit()
    await storage.delete_prefix(project_prefix(project_id))
