import datetime as dt
import json
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


def _invalid():
    _error("invalid_transform_params", "Перемещение задаётся сдвигом [x, y, z] и поворотом { axis, angle, origin }.")


def _vector(value: object) -> list[float]:
    if (
        not isinstance(value, list)
        or len(value) != 3
        or not all(isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item) for item in value)
    ):
        _invalid()
    return [float(item) for item in value]


def parse_translate(value: str) -> list[float]:
    try:
        return _vector(json.loads(value))
    except json.JSONDecodeError:
        _invalid()


def parse_rotate(value: str | None) -> dict | None:
    if value in (None, "", "null"):
        return None
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        _invalid()
    if not isinstance(raw, dict) or set(raw) != {"axis", "angle", "origin"}:
        _invalid()
    axis = _vector(raw["axis"])
    angle = raw["angle"]
    if math.hypot(*axis) < 1e-9 or not isinstance(angle, (int, float)) or isinstance(angle, bool) or not math.isfinite(angle):
        _invalid()
    return {"axis": axis, "angle": float(angle), "origin": _vector(raw["origin"])}


async def save_browser_transform(
    project_id: str,
    user_id: str,
    body_id: str,
    translate: list[float],
    rotate: dict | None,
    copy: bool,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    if not copy and all(abs(value) < 1e-9 for value in translate) and (rotate is None or abs(rotate["angle"] % 360) < 1e-9):
        _error("invalid_transform_params", "Перемещение без сдвига и поворота ничего не меняет.")
    mesh = await checked_browser_upload(step_bytes, mesh_json)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    source = _visible_browser_body(components, body_id)

    result_body_id = new_body_id()
    key_params = {"feature_key": feature_key} if feature_key else {}
    transform = {"target_body_id": body_id, "translate": translate, "rotate": rotate, "copy": copy}
    components[result_body_id] = {
        "type": "body",
        "source": {"kind": "browser_transform", **transform, **key_params},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    hidden_body_ids = [] if copy else [body_id]
    if not copy:
        components[body_id] = {**source, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "transform",
        "label": next_label(timeline, "transform"),
        "body_id": result_body_id,
        "params": {**transform, **key_params, "engine": "browser_wasm"},
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, result_body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": result_body_id, "mesh": mesh, "hidden_body_ids": hidden_body_ids}
