from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_upload_route import BrowserUploadRoute
from app.api.deps import get_current_active_user, get_db, get_storage
from app.core.storage import AsyncStorageClient
from app.models.user import User
from app.schemas.geometry import ExtrudeResponse, MeshResponse
from app.services.geometry_ops.browser_naming import validated_browser_naming, validated_feature_key
from app.services.geometry_ops.browser_shell import parse_face_names, save_browser_shell
from app.services.geometry_ops.limits import MAX_STEP_BYTES

router = APIRouter(prefix="/projects", tags=["geometry"], route_class=BrowserUploadRoute)


@router.post("/{project_id}/geometry/browser-shell", response_model=ExtrudeResponse)
async def browser_shell_endpoint(
    project_id: str,
    step: UploadFile = File(...),
    mesh: str = Form(...),
    body_id: str = Form(...),
    face_ids: str = Form(...),
    thickness: float = Form(...),
    direction: str = Form("inward"),
    document_version: int = Form(...),
    naming: str | None = Form(None),
    feature_key: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    result = await save_browser_shell(
        project_id, current_user.id, body_id, parse_face_names(face_ids),
        {"thickness": thickness, "direction": direction}, document_version,
        await step.read(MAX_STEP_BYTES + 1), mesh, db, storage,
        naming=validated_browser_naming(naming), feature_key=validated_feature_key(feature_key),
    )
    return ExtrudeResponse(
        body_id=result["body_id"],
        mesh=MeshResponse(**result["mesh"]),
        hidden_body_ids=result["hidden_body_ids"],
    )
