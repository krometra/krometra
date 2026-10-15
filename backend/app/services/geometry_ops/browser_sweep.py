"""Сохранение протяжки по траектории, построенной браузерным ядром."""

import datetime as dt
import uuid
from dataclasses import dataclass

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.schemas.ids import is_component_id
from app.services.document_service import get_document

from .browser_extrude import _browser_boolean_target, _error, checked_browser_upload
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id, next_label

ORIENTATIONS = ("corrected", "frenet")


@dataclass(frozen=True)
class BrowserSweepParams:
    sketch_id: str
    path_sketch_id: str
    orientation: str
    operation: str
    target_body_id: str | None


def validated_sweep_params(params: BrowserSweepParams) -> BrowserSweepParams:
    if not is_component_id(params.sketch_id) or not is_component_id(params.path_sketch_id):
        _error("invalid_sketch_id", "Некорректный идентификатор эскиза.")
    if params.sketch_id == params.path_sketch_id:
        _error("invalid_sweep_params", "Профиль и путь протяжки должны быть в разных эскизах.")
    if params.orientation not in ORIENTATIONS:
        _error("invalid_sweep_params", "Ориентация профиля — corrected или frenet.")
    return params


def _require_sketch(components: dict, sketch_id: str) -> None:
    sketch = components.get(sketch_id)
    if not isinstance(sketch, dict) or not isinstance(sketch.get("entities"), list):
        _error("sketch_not_found", f"Эскиз '{sketch_id}' не найден.", status.HTTP_404_NOT_FOUND)


async def save_browser_sweep(
    project_id: str,
    user_id: str,
    params: BrowserSweepParams,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    validated_sweep_params(params)
    mesh = await checked_browser_upload(step_bytes, mesh_json)
    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    _require_sketch(components, params.sketch_id)
    _require_sketch(components, params.path_sketch_id)
    target_body_id = _browser_boolean_target(components, params.operation, params.target_body_id)

    body_id = new_body_id()
    feature = {
        "path_sketch_id": params.path_sketch_id,
        "orientation": params.orientation,
        "operation": params.operation,
        **({"target_body_id": target_body_id} if target_body_id else {}),
        **({"feature_key": feature_key} if feature_key else {}),
    }
    hidden_body_ids = [target_body_id] if target_body_id else []
    for hidden_body_id in hidden_body_ids:
        components[hidden_body_id] = {**components[hidden_body_id], "visible": False}
    components[body_id] = {
        "type": "body",
        "source": {"kind": "browser_sweep", "sketch_id": params.sketch_id, **feature},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "sweep",
        "label": next_label(timeline, "sweep"),
        "sketch_id": params.sketch_id,
        "body_id": body_id,
        "params": {**feature, "engine": "browser_wasm"},
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": body_id, "mesh": mesh, "hidden_body_ids": hidden_body_ids}
