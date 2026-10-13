"""Project routes: CRUD with user isolation."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, get_storage
from app.core.storage import AsyncStorageClient
from app.models.user import User
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.project_service import ProjectError, create_project, delete_project, get_project, list_projects, update_project
from app.services.thumbnail_service import MAX_THUMBNAIL_BYTES, delete_thumbnail, load_thumbnail, save_thumbnail

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/", response_model=ProjectListResponse)
async def get_projects(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List all projects owned by the current user."""
    projects = await list_projects(db, current_user.id)
    return ProjectListResponse(
        projects=[ProjectResponse.model_validate(p) for p in projects]
    )


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_new_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new project."""
    try:
        project = await create_project(db, current_user.id, data)
    except ProjectError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    return ProjectResponse.model_validate(project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_single_project(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a project by ID."""
    try:
        project = await get_project(db, project_id, current_user.id)
        return ProjectResponse.model_validate(project)
    except ProjectError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_existing_project(
    project_id: str,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a project (rename, description)."""
    try:
        project = await update_project(db, project_id, current_user.id, data)
        return ProjectResponse.model_validate(project)
    except ProjectError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_project(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    """Delete a project and all associated data."""
    try:
        await delete_project(db, project_id, current_user.id, storage)
    except ProjectError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.get("/{project_id}/thumbnail", response_class=Response)
async def get_thumbnail(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    """PNG-превью проекта, снятое клиентом с вьюпорта; 204 — превью нет."""
    try:
        png = await load_thumbnail(db, project_id, current_user.id, storage)
    except ProjectError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    if not png:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "private, no-cache"})


@router.put("/{project_id}/thumbnail", status_code=status.HTTP_204_NO_CONTENT)
async def put_thumbnail(
    project_id: str,
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    """Сохранить PNG-превью проекта."""
    try:
        await save_thumbnail(db, project_id, current_user.id, await image.read(MAX_THUMBNAIL_BYTES + 1), storage)
    except ProjectError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.delete("/{project_id}/thumbnail", status_code=status.HTTP_204_NO_CONTENT)
async def remove_thumbnail(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    """Удалить превью проекта, когда в нём не осталось видимых тел."""
    try:
        await delete_thumbnail(db, project_id, current_user.id, storage)
    except ProjectError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
