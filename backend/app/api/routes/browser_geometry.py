"""Маршруты browser-ядра: таблица имён, скругление/фаска, пересборка истории."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_upload_route import BrowserRebuildRoute, BrowserUploadRoute
from app.api.deps import get_current_active_user, get_db, get_storage
from app.core.storage import AsyncStorageClient
from app.models.user import User
from app.schemas.geometry import ExtrudeResponse, MeshResponse
from app.services.geometry_ops.browser_edge_feature import parse_edge_names, save_browser_edge_feature
from app.services.geometry_ops.browser_fillet_merge import parse_entry_ids, save_browser_fillet_merge
from app.services.geometry_ops.browser_rebuild import (
    RebuiltBody,
    parse_rebuild_json,
    save_browser_rebuild,
    validated_rebuild_body_ids,
)
from app.services.geometry_ops.browser_regen import save_browser_regen
from app.services.geometry_ops.browser_naming import (
    load_browser_naming,
    validated_browser_naming,
    validated_feature_key,
)
from app.services.geometry_ops.limits import MAX_STEP_BYTES

router = APIRouter(prefix="/projects", tags=["browser-geometry"], route_class=BrowserUploadRoute)


@router.get("/{project_id}/geometry/{body_id}/browser-naming", response_class=Response)
async def get_browser_naming(
    project_id: str,
    body_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    naming = await load_browser_naming(project_id, body_id, current_user.id, db, storage)
    return Response(naming, media_type="application/json")


async def _edge_feature(
    kind: str,
    project_id: str,
    body_id: str,
    edge_ids: str,
    params: dict,
    document_version: int,
    step: UploadFile,
    mesh: str,
    naming: str | None,
    feature_key: str | None,
    user: User,
    db: AsyncSession,
    storage: AsyncStorageClient,
) -> ExtrudeResponse:
    result = await save_browser_edge_feature(
        project_id=project_id,
        user_id=user.id,
        kind=kind,
        body_id=body_id,
        edge_names=parse_edge_names(edge_ids),
        params=params,
        document_version=document_version,
        step_bytes=await step.read(MAX_STEP_BYTES + 1),
        mesh_json=mesh,
        db=db,
        storage=storage,
        naming=validated_browser_naming(naming),
        feature_key=validated_feature_key(feature_key),
    )
    return ExtrudeResponse(
        body_id=result["body_id"],
        mesh=MeshResponse(**result["mesh"]),
        hidden_body_ids=result["hidden_body_ids"],
    )


@router.post("/{project_id}/geometry/browser-fillet", response_model=ExtrudeResponse)
async def browser_fillet_endpoint(
    project_id: str,
    step: UploadFile = File(...),
    mesh: str = Form(...),
    body_id: str = Form(...),
    edge_ids: str = Form(...),
    radius: float = Form(...),
    document_version: int = Form(...),
    naming: str | None = Form(None),
    feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    return await _edge_feature(
        "fillet", project_id, body_id, edge_ids, {"radius": radius}, document_version,
        step, mesh, naming, feature_key, current_user, db, storage,
    )


@router.post("/{project_id}/geometry/browser-chamfer", response_model=ExtrudeResponse)
async def browser_chamfer_endpoint(
    project_id: str,
    step: UploadFile = File(...),
    mesh: str = Form(...),
    body_id: str = Form(...),
    edge_ids: str = Form(...),
    distance1: float = Form(...),
    distance2: float = Form(...),
    document_version: int = Form(...),
    naming: str | None = Form(None),
    feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    return await _edge_feature(
        "chamfer", project_id, body_id, edge_ids, {"distance1": distance1, "distance2": distance2},
        document_version, step, mesh, naming, feature_key, current_user, db, storage,
    )


@router.post("/{project_id}/geometry/browser-fillet-merge", response_model=ExtrudeResponse)
async def browser_fillet_merge_endpoint(
    project_id: str,
    step: UploadFile = File(...),
    mesh: str = Form(...),
    entry_ids: str = Form(...),
    edge_ids: str = Form(...),
    radius: float = Form(...),
    document_version: int = Form(...),
    naming: str | None = Form(None),
    feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    result = await save_browser_fillet_merge(
        project_id=project_id,
        user_id=current_user.id,
        entry_ids=parse_entry_ids(entry_ids),
        edge_names=parse_edge_names(edge_ids),
        radius=radius,
        document_version=document_version,
        step_bytes=await step.read(MAX_STEP_BYTES + 1),
        mesh_json=mesh,
        db=db,
        storage=storage,
        naming=validated_browser_naming(naming),
        feature_key=validated_feature_key(feature_key),
    )
    return ExtrudeResponse(
        body_id=result["body_id"],
        mesh=MeshResponse(**result["mesh"]),
        hidden_body_ids=result["hidden_body_ids"],
    )


async def _rebuilt_bodies(form, body_ids: list) -> list[RebuiltBody]:
    bodies = []
    for body_id in validated_rebuild_body_ids(body_ids):
        step = form.get(f"step:{body_id}")
        mesh = form.get(f"mesh:{body_id}")
        naming = form.get(f"naming:{body_id}")
        if not hasattr(step, "read") or not isinstance(mesh, str):
            raise HTTPException(status_code=400, detail={
                "error": "rebuild_bodies_mismatch",
                "error_description": "Для каждого пересобранного тела нужны STEP и меш.",
            })
        bodies.append(RebuiltBody(body_id, await step.read(MAX_STEP_BYTES + 1), mesh, naming if isinstance(naming, str) else None))
    return bodies


async def browser_rebuild_endpoint(
    project_id: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    form = await request.form()
    document_version = _form_version(form)
    body_ids = parse_rebuild_json(str(form.get("bodies", "")), list, "Некорректный список пересобранных тел.")
    params = parse_rebuild_json(str(form.get("params", "")), dict, "Некорректные параметры операции.")
    sketch_planes = parse_rebuild_json(str(form.get("sketch_planes", "{}")), dict, "Некорректные плоскости эскизов.")
    failed = parse_rebuild_json(str(form.get("failed", "{}")), dict, "Некорректный список операций, которые не построились.")
    return await save_browser_rebuild(
        project_id=project_id,
        user_id=current_user.id,
        entry_id=str(form.get("entry_id", "")),
        params=params,
        bodies=await _rebuilt_bodies(form, body_ids),
        sketch_planes=sketch_planes,
        document_version=document_version,
        db=db,
        storage=storage,
        failed=failed,
    )


def _form_version(form) -> int:
    try:
        return int(str(form.get("document_version")))
    except ValueError:
        raise HTTPException(status_code=400, detail={
            "error": "invalid_rebuild_params", "error_description": "Не передана версия документа.",
        })


async def browser_regen_endpoint(
    project_id: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    form = await request.form()
    body_ids = parse_rebuild_json(str(form.get("bodies", "")), list, "Некорректный список пересобранных тел.")
    return await save_browser_regen(
        project_id=project_id,
        user_id=current_user.id,
        document=parse_rebuild_json(str(form.get("document", "")), dict, "Некорректный документ после правки истории."),
        seeds=parse_rebuild_json(str(form.get("seeds", "")), dict, "Некорректные корни пересборки."),
        bodies=await _rebuilt_bodies(form, body_ids),
        sketch_planes=parse_rebuild_json(str(form.get("sketch_planes", "{}")), dict, "Некорректные плоскости эскизов."),
        document_version=_form_version(form),
        db=db,
        storage=storage,
    )


router.add_api_route(
    "/{project_id}/geometry/browser-regen",
    browser_regen_endpoint,
    methods=["POST"],
    route_class_override=BrowserRebuildRoute,
)

router.add_api_route(
    "/{project_id}/geometry/browser-rebuild",
    browser_rebuild_endpoint,
    methods=["POST"],
    route_class_override=BrowserRebuildRoute,
)
