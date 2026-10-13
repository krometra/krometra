"""Сохранение резьбы, нарезанной браузерным ядром OCCT/WASM."""

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, get_storage
from app.core.storage import AsyncStorageClient
from app.models.user import User
from app.schemas.geometry import MeshResponse, ThreadResponse
from app.services.geometry_ops.browser_naming import validated_browser_naming, validated_feature_key
from app.services.geometry_ops.browser_thread import BrowserThreadParams, save_browser_thread
from app.services.geometry_ops.limits import MAX_STEP_BYTES
from app.api.browser_upload_route import BrowserUploadRoute

router = APIRouter(prefix="/projects", tags=["geometry"], route_class=BrowserUploadRoute)


@router.post("/{project_id}/geometry/browser-thread", response_model=ThreadResponse)
async def browser_thread_endpoint(
    project_id: str,
    step: UploadFile = File(...),
    mesh: str = Form(...),
    body_id: str = Form(...),
    face_id: str = Form(...),
    pitch: float = Form(...),
    depth: float = Form(...),
    length: float = Form(...),
    offset: float = Form(0.0),
    crest_ratio: float = Form(0.0),
    starts: int = Form(1),
    right_handed: bool = Form(True),
    external: bool = Form(...),
    diameter: float = Form(...),
    document_version: int = Form(...),
    naming: str | None = Form(None),
    feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    params = BrowserThreadParams(
        face_id=face_id, pitch=pitch, depth=depth, length=length, offset=offset, crest_ratio=crest_ratio,
        starts=starts, right_handed=right_handed, external=external, diameter=diameter,
    )
    result = await save_browser_thread(
        project_id, current_user.id, body_id, params, document_version, await step.read(MAX_STEP_BYTES + 1), mesh, db, storage,
        naming=validated_browser_naming(naming), feature_key=validated_feature_key(feature_key),
    )
    return ThreadResponse(**{**result, "mesh": MeshResponse(**result["mesh"])})
