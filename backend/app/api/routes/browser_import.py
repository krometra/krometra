from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_upload_route import BrowserImportRoute
from app.api.deps import get_current_active_user, get_db, get_storage
from app.core.storage import AsyncStorageClient
from app.models.user import User
from app.schemas.geometry import ImportResponse
from app.services.geometry_ops.browser_import import checked_import_count, paired_import_bodies, save_browser_import
from app.services.geometry_ops.limits import MAX_STEP_BYTES

router = APIRouter(prefix="/projects", tags=["browser-geometry"], route_class=BrowserImportRoute)


@router.post("/{project_id}/geometry/browser-import", response_model=ImportResponse)
async def browser_import_endpoint(
    project_id: str,
    steps: list[UploadFile] = File(...),
    meshes: list[str] = Form(...),
    namings: list[str] = Form(...),
    file_name: str = Form(...),
    document_version: int = Form(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    checked_import_count(len(steps))
    bodies = paired_import_bodies([await step.read(MAX_STEP_BYTES + 1) for step in steps], meshes, namings)
    return await save_browser_import(
        project_id=project_id,
        user_id=current_user.id,
        file_name=file_name,
        bodies=bodies,
        document_version=document_version,
        db=db,
        storage=storage,
    )
