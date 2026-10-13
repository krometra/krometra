"""Geometry routes: сохранение и выдача геометрии браузерного ядра."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, get_storage
from app.core.storage import AsyncStorageClient
from app.models.user import User
from app.schemas.geometry import BooleanResponse, ExtrudeResponse, MeshResponse, RevolveResponse
from app.services.geometry_ops import (
    get_mesh,
    load_browser_step,
    parse_revolve_origin,
    save_browser_boolean,
    save_browser_extrude,
)
from app.services.geometry_ops.browser_naming import validated_browser_naming, validated_feature_key
from app.services.geometry_ops.limits import MAX_STEP_BYTES
from app.api.browser_upload_route import BrowserUploadRoute

router = APIRouter(prefix="/projects", tags=["geometry"], route_class=BrowserUploadRoute)


@router.post("/{project_id}/geometry/browser-extrude", response_model=ExtrudeResponse)
async def browser_extrude_endpoint(
    project_id: str,
    step: UploadFile = File(...),
    mesh: str = Form(...),
    sketch_id: str = Form(...),
    distance: float = Form(...),
    direction: str = Form(...),
    document_version: int = Form(...),
    operation: str = Form("new_body"),
    target_body_id: str | None = Form(None),
    naming: str | None = Form(None),
    feature_key: str | None = Form(None),
    extent_type: str = Form("distance"),
    back_distance: float = Form(0.0),
    offset: float = Form(0.0),
    up_to_body_id: str | None = Form(None),
    up_to_face_id: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    """Сохранить экспериментальное выдавливание, построенное OCCT/WASM."""
    result = await save_browser_extrude(
        project_id=project_id,
        user_id=current_user.id,
        sketch_id=sketch_id,
        distance=distance,
        direction=direction,
        document_version=document_version,
        step_bytes=await step.read(MAX_STEP_BYTES + 1),
        mesh_json=mesh,
        db=db,
        storage=storage,
        operation=operation,
        target_body_id=target_body_id,
        naming=validated_browser_naming(naming),
        feature_key=validated_feature_key(feature_key),
        extent_type=extent_type,
        back_distance=back_distance,
        offset=offset,
        up_to_body_id=up_to_body_id,
        up_to_face_id=up_to_face_id,
    )
    return ExtrudeResponse(
        body_id=result["body_id"],
        mesh=MeshResponse(**result["mesh"]),
        hidden_body_ids=result["hidden_body_ids"],
    )


@router.post("/{project_id}/geometry/browser-revolve", response_model=RevolveResponse)
async def browser_revolve_endpoint(
    project_id: str,
    step: UploadFile = File(...), mesh: str = Form(...), sketch_id: str = Form(...),
    axis_origin: str = Form(...), axis: str = Form(...), angle: float = Form(...),
    direction: str = Form(...), document_version: int = Form(...),
    naming: str | None = Form(None), feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    if axis not in ("x", "y") or not (0 < angle <= 360):
        raise HTTPException(status_code=400, detail={"error": "invalid_revolve_params", "error_description": "Некорректные параметры вращения."})
    origin = parse_revolve_origin(axis_origin)
    result = await save_browser_extrude(
        project_id, current_user.id, sketch_id, 0, direction, document_version, await step.read(MAX_STEP_BYTES + 1), mesh, db, storage,
        feature_kind="revolve", axis_origin=origin, axis=axis, angle=angle,
        naming=validated_browser_naming(naming), feature_key=validated_feature_key(feature_key),
    )
    return RevolveResponse(body_id=result["body_id"], mesh=MeshResponse(**result["mesh"]))


@router.post("/{project_id}/geometry/browser-boolean", response_model=BooleanResponse)
async def browser_boolean_endpoint(
    project_id: str,
    step: UploadFile = File(...),
    mesh: str = Form(...),
    operation: str = Form(...),
    target_body_id: str = Form(...),
    tool_body_id: str = Form(...),
    document_version: int = Form(...),
    naming: str | None = Form(None),
    feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    """Сохранить булеву операцию, выполненную OCCT/WASM."""
    result = await save_browser_boolean(
        project_id=project_id,
        user_id=current_user.id,
        operation=operation,
        target_body_id=target_body_id,
        tool_body_id=tool_body_id,
        document_version=document_version,
        step_bytes=await step.read(MAX_STEP_BYTES + 1),
        mesh_json=mesh,
        db=db,
        storage=storage,
        naming=validated_browser_naming(naming),
        feature_key=validated_feature_key(feature_key),
    )
    return BooleanResponse(result_body_id=result["result_body_id"], mesh=MeshResponse(**result["mesh"]))


@router.get("/{project_id}/geometry/{body_id}/browser-step", response_class=Response)
async def get_browser_step(
    project_id: str,
    body_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    """Загрузить opaque STEP для восстановления browser-worker при открытии."""
    step = await load_browser_step(project_id, body_id, current_user.id, db, storage)
    return Response(step, media_type="application/step")


@router.get("/{project_id}/geometry/{body_id}/mesh", response_model=MeshResponse)
async def get_body_mesh(
    project_id: str,
    body_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    """Get tessellated mesh for a body (with MinIO caching)."""
    return await get_mesh(project_id, body_id, current_user.id, db, storage)
