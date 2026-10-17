"""Сохранение лофта, построенного браузерным ядром OCCT/WASM."""

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_upload_route import BrowserUploadRoute
from app.api.deps import get_current_active_user, get_db, get_storage
from app.core.storage import AsyncStorageClient
from app.models.user import User
from app.schemas.geometry import ExtrudeResponse, MeshResponse
from app.services.geometry_ops.browser_loft import BrowserLoftParams, parsed_profile_sketch_ids, save_browser_loft
from app.services.geometry_ops.browser_naming import validated_browser_naming, validated_feature_key
from app.services.geometry_ops.limits import MAX_STEP_BYTES

router = APIRouter(prefix="/projects", tags=["geometry"], route_class=BrowserUploadRoute)


@router.post("/{project_id}/geometry/browser-loft", response_model=ExtrudeResponse)
async def browser_loft_endpoint(
    project_id: str,
    step: UploadFile = File(...),
    mesh: str = Form(...),
    profile_sketch_ids: str = Form(...),
    document_version: int = Form(...),
    transition: str = Form("smooth"),
    operation: str = Form("new_body"),
    target_body_id: str | None = Form(None),
    naming: str | None = Form(None),
    feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    params = BrowserLoftParams(
        profile_sketch_ids=parsed_profile_sketch_ids(profile_sketch_ids), transition=transition, operation=operation, target_body_id=target_body_id,
    )
    result = await save_browser_loft(
        project_id, current_user.id, params, document_version, await step.read(MAX_STEP_BYTES + 1), mesh, db, storage,
        naming=validated_browser_naming(naming), feature_key=validated_feature_key(feature_key),
    )
    return ExtrudeResponse(body_id=result["body_id"], mesh=MeshResponse(**result["mesh"]), hidden_body_ids=result["hidden_body_ids"])
