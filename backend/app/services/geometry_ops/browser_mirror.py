import datetime as dt
import math
import uuid

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.services.document_service import get_document

from .browser_boolean import _visible_browser_body
from .browser_extrude import _error, checked_browser_upload
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id, next_label

MIRROR_PLANES = ("XY", "XZ", "YZ")
MAX_FACE_ID_LENGTH = 200


def _invalid(description: str):
    _error("invalid_mirror_params", description)


def mirror_plane_params(plane: str | None, offset: float, face_id: str | None) -> dict:
    if (plane is None) == (face_id is None):
        _invalid("Зеркало задаётся либо базовой плоскостью XY, XZ, YZ, либо плоской гранью тела.")
    if face_id is not None:
        if not face_id.startswith("f-") or len(face_id) > MAX_FACE_ID_LENGTH:
            _invalid("Некорректный идентификатор грани зеркала.")
        return {"plane": None, "offset": 0.0, "face_id": face_id}
    if plane not in MIRROR_PLANES:
        _invalid("Базовая плоскость зеркала — XY, XZ или YZ.")
    if not math.isfinite(offset):
        _invalid("Смещение плоскости зеркала должно быть конечным числом.")
    return {"plane": plane, "offset": float(offset), "face_id": None}


def check_mirror_rebuild(entry: dict, new_params: dict) -> None:
    if entry.get("kind") == "mirror" and new_params and (entry.get("params") or {}).get("face_id"):
        _invalid("Плоскость зеркала по грани меняется только новой операцией.")


async def save_browser_mirror(
    project_id: str,
    user_id: str,
    body_id: str,
    plane: dict,
    merge: bool,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    mesh = await checked_browser_upload(step_bytes, mesh_json)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    source = _visible_browser_body(components, body_id)

    result_body_id = new_body_id()
    key_params = {"feature_key": feature_key} if feature_key else {}
    mirror = {"target_body_id": body_id, **plane, "merge": merge}
    components[result_body_id] = {
        "type": "body",
        "source": {"kind": "browser_mirror", **mirror, **key_params},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    hidden_body_ids = [body_id] if merge else []
    if merge:
        components[body_id] = {**source, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "mirror",
        "label": next_label(timeline, "mirror"),
        "body_id": result_body_id,
        "params": {**mirror, **key_params, "engine": "browser_wasm"},
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, result_body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": result_body_id, "mesh": mesh, "hidden_body_ids": hidden_body_ids}
