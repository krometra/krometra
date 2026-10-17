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

MIN_DISTANCE = 1e-4
MAX_PRESS_PULL_FACES = 64


def validated_press_pull_params(face_names: list[str], distance: object) -> dict:
    if (
        not isinstance(distance, (int, float))
        or isinstance(distance, bool)
        or not math.isfinite(distance)
        or abs(distance) < MIN_DISTANCE
    ):
        _error("invalid_press_pull_params", "Смещение грани не может быть нулевым: плюс наружу, минус внутрь тела.")
    if len(face_names) > MAX_PRESS_PULL_FACES:
        _error("invalid_press_pull_params", f"Одной операцией можно сдвинуть не больше {MAX_PRESS_PULL_FACES} граней.")
    return {"distance": float(distance)}


async def save_browser_press_pull(
    project_id: str,
    user_id: str,
    body_id: str,
    face_names: list[str],
    distance: float,
    new_body: bool,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    params = validated_press_pull_params(face_names, distance)
    mesh = await checked_browser_upload(step_bytes, mesh_json)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    source = _visible_browser_body(components, body_id)

    result_body_id = new_body_id()
    key_params = {"feature_key": feature_key} if feature_key else {}
    press_pull = {"target_body_id": body_id, "face_ids": face_names, **params, "new_body": new_body}
    components[result_body_id] = {
        "type": "body",
        "source": {"kind": "browser_press_pull", **press_pull, **key_params},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    hidden_body_ids = [] if new_body else [body_id]
    if not new_body:
        components[body_id] = {**source, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "press_pull",
        "label": next_label(timeline, "press_pull"),
        "body_id": result_body_id,
        "params": {**press_pull, **key_params, "engine": "browser_wasm"},
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, result_body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": result_body_id, "mesh": mesh, "hidden_body_ids": hidden_body_ids}
