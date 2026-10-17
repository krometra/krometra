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
from .browser_mirror import MAX_FACE_ID_LENGTH, MIRROR_PLANES
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id, next_label

MAX_DRAFT_ANGLE = 90.0


def _invalid(description: str):
    _error("invalid_draft_params", description)


def is_draft_angle(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 0 < value < MAX_DRAFT_ANGLE
    )


def draft_neutral_params(plane: str | None, face_id: str | None) -> dict:
    if (plane is None) == (face_id is None):
        _invalid("Нейтраль уклона задаётся либо базовой плоскостью XY, XZ, YZ, либо плоской гранью тела.")
    if face_id is not None:
        if not face_id.startswith("f-") or len(face_id) > MAX_FACE_ID_LENGTH:
            _invalid("Некорректный идентификатор нейтральной грани.")
        return {"neutral_plane": None, "neutral_face_id": face_id}
    if plane not in MIRROR_PLANES:
        _invalid("Нейтральная плоскость уклона - XY, XZ или YZ.")
    return {"neutral_plane": plane, "neutral_face_id": None}


def validated_draft_params(face_names: list[str], neutral: dict, angle_deg: object, reverse: object) -> dict:
    if not is_draft_angle(angle_deg):
        _invalid("Угол уклона должен быть больше 0° и меньше 90°.")
    if not isinstance(reverse, bool):
        _invalid("Реверс уклона - true или false.")
    if neutral.get("neutral_face_id") in face_names:
        _invalid("Нейтральная грань не может сама идти под уклон.")
    return {"face_ids": face_names, **neutral, "angle_deg": float(angle_deg), "reverse": reverse}


async def save_browser_draft(
    project_id: str,
    user_id: str,
    body_id: str,
    params: dict,
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
    draft = {"target_body_id": body_id, **params}
    components[result_body_id] = {
        "type": "body",
        "source": {"kind": "browser_draft", **draft, **key_params},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    components[body_id] = {**source, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "draft",
        "label": next_label(timeline, "draft"),
        "body_id": result_body_id,
        "params": {**draft, **key_params, "engine": "browser_wasm"},
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, result_body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": result_body_id, "mesh": mesh, "hidden_body_ids": [body_id]}
