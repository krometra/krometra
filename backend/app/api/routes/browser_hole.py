"""Сохранение отверстий, построенных браузерным ядром OCCT/WASM."""

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_upload_route import BrowserUploadRoute
from app.api.deps import get_current_active_user, get_db, get_storage
from app.core.storage import AsyncStorageClient
from app.models.user import User
from app.schemas.geometry import HoleResponse, MeshResponse
from app.services.geometry_ops.browser_hole import BrowserHoleParams, parse_hole_centers, save_browser_hole
from app.services.geometry_ops.browser_naming import validated_browser_naming, validated_feature_key
from app.services.geometry_ops.limits import MAX_STEP_BYTES

router = APIRouter(prefix="/projects", tags=["geometry"], route_class=BrowserUploadRoute)


@router.post("/{project_id}/geometry/browser-hole", response_model=HoleResponse)
async def browser_hole_endpoint(
    project_id: str,
    step: UploadFile = File(...),
    mesh: str = Form(...),
    body_id: str = Form(...),
    face_id: str = Form(...),
    centers: str = Form(...),
    hole_type: str = Form("simple"),
    diameter: float = Form(...),
    extent: str = Form("distance"),
    depth: float = Form(...),
    bottom: str = Form("flat"),
    cbore_diameter: float = Form(...),
    cbore_depth: float = Form(...),
    csink_diameter: float = Form(...),
    csink_angle: float = Form(...),
    sketch_id: str | None = Form(None),
    document_version: int = Form(...),
    naming: str | None = Form(None),
    feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    params = BrowserHoleParams(
        face_id=face_id, hole_type=hole_type, diameter=diameter, extent=extent, depth=depth, bottom=bottom,
        cbore_diameter=cbore_diameter, cbore_depth=cbore_depth, csink_diameter=csink_diameter, csink_angle=csink_angle,
        centers=tuple(tuple(center) for center in parse_hole_centers(centers)),
    )
    result = await save_browser_hole(
        project_id, current_user.id, body_id, params, sketch_id, document_version,
        await step.read(MAX_STEP_BYTES + 1), mesh, db, storage,
        naming=validated_browser_naming(naming), feature_key=validated_feature_key(feature_key),
    )
    return HoleResponse(**{**result, "mesh": MeshResponse(**result["mesh"])})
