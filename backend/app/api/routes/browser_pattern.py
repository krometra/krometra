"""Сохранение массива тел, построенного браузерным ядром OCCT/WASM."""

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_upload_route import BrowserImportRoute
from app.api.deps import get_current_active_user, get_db, get_storage
from app.core.storage import AsyncStorageClient
from app.models.user import User
from app.schemas.geometry import PatternResponse
from app.services.geometry_ops.browser_import import checked_import_count, paired_import_bodies
from app.services.geometry_ops.browser_naming import validated_feature_key
from app.services.geometry_ops.browser_pattern import save_browser_pattern
from app.services.geometry_ops.browser_pattern_params import parse_pattern_params
from app.services.geometry_ops.limits import MAX_STEP_BYTES

router = APIRouter(prefix="/projects", tags=["browser-geometry"], route_class=BrowserImportRoute)


@router.post("/{project_id}/geometry/browser-pattern", response_model=PatternResponse)
async def browser_pattern_endpoint(
    project_id: str,
    steps: list[UploadFile] = File(...),
    meshes: list[str] = Form(...),
    namings: list[str] = Form(...),
    body_id: str = Form(...),
    pattern: str = Form(...),
    document_version: int = Form(...),
    feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    params = parse_pattern_params(pattern)
    checked_import_count(len(steps))
    bodies = paired_import_bodies([await step.read(MAX_STEP_BYTES + 1) for step in steps], meshes, namings)
    return await save_browser_pattern(
        project_id, current_user.id, body_id, params, bodies, document_version, db, storage,
        feature_key=validated_feature_key(feature_key),
    )
