import asyncio
import datetime as dt
import json
import uuid

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.schemas.ids import is_component_id
from app.services.document_service import get_document

from .browser_extrude import _error, browser_extent_params, is_browser_body
from .browser_import import ImportedBody, _validated_uploads
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id, next_label
from .limits import MAX_REBUILD_BODIES
from .target_resolution import resolve_target_bodies
from .profile_regions import profile_region_params

EXTRUDE_DIRECTIONS = ("one_side", "symmetric", "two_sided")


def parse_cut_targets(value: str) -> list[str]:
    try:
        targets = json.loads(value)
    except json.JSONDecodeError:
        targets = None
    if not isinstance(targets, list) or not targets or not all(isinstance(target, str) and target for target in targets):
        _error("invalid_extrude_params", "Список тел для выреза должен быть непустым массивом идентификаторов.")
    if len(targets) > MAX_REBUILD_BODIES:
        _error("invalid_extrude_params", f"Один вырез может задеть не больше {MAX_REBUILD_BODIES} тел.")
    if len(set(targets)) != len(targets):
        _error("invalid_extrude_params", "Тело для выреза указано дважды.")
    return targets


def _checked_targets(components: dict, target_body_ids: list[str]) -> None:
    if resolve_target_bodies(components, target_body_ids) != target_body_ids:
        _error("target_changed", "Целевое тело изменилось во время построения в браузере.", status.HTTP_409_CONFLICT)
    if not all(is_browser_body(components[target_body_id]) for target_body_id in target_body_ids):
        _error("target_not_browser", "Браузерное ядро может изменять только browser-тела.")


async def save_browser_extrude_cuts(
    project_id: str,
    user_id: str,
    sketch_id: str,
    distance: float,
    direction: str,
    target_body_ids: list[str],
    bodies: list[ImportedBody],
    document_version: int,
    db: AsyncSession,
    storage: AsyncStorageClient,
    feature_key: str | None = None,
    extent_type: str = "distance",
    back_distance: float = 0.0,
    offset: float = 0.0,
    up_to_body_id: str | None = None,
    up_to_face_id: str | None = None,
    profile_regions: list[str] | None = None,
) -> dict:
    if not is_component_id(sketch_id):
        _error("invalid_sketch_id", "Некорректный идентификатор эскиза.")
    if direction not in EXTRUDE_DIRECTIONS:
        _error("invalid_extrude_params", f"Поддерживаются направления {', '.join(EXTRUDE_DIRECTIONS)}.")
    if abs(distance) < 1e-9:
        _error("zero_distance", "Расстояние выдавливания не может быть нулевым.")
    if len(bodies) != len(target_body_ids):
        _error("cut_bodies_mismatch", "Для каждого задетого тела нужны STEP, меш и таблица имён.")
    uploads = await asyncio.to_thread(_validated_uploads, bodies)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    sketch = components.get(sketch_id)
    if not isinstance(sketch, dict) or not isinstance(sketch.get("entities"), list):
        _error("sketch_not_found", f"Эскиз '{sketch_id}' не найден.", status.HTTP_404_NOT_FOUND)
    _checked_targets(components, target_body_ids)
    extent_params = browser_extent_params(
        components, "cut", direction, extent_type, back_distance, offset, up_to_body_id, up_to_face_id,
    )
    shared = {
        "distance": distance,
        "direction": direction,
        "operation": "cut",
        **({"feature_key": feature_key} if feature_key else {}),
        **extent_params,
        **profile_region_params(profile_regions),
    }

    body_ids: list[str] = []
    objects = []
    for target_body_id, (body, mesh, naming) in zip(target_body_ids, uploads):
        body_id = new_body_id()
        components[body_id] = {
            "type": "body",
            "source": {"kind": "browser_extrude", "sketch_id": sketch_id, **shared, "target_body_id": target_body_id},
            "visible": True,
            "bbox": mesh["bbox"],
        }
        components[target_body_id] = {**components[target_body_id], "visible": False}
        objects += await browser_body_objects(project_id, body_id, body.step, mesh, naming)
        body_ids.append(body_id)

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "extrude",
        "label": next_label(timeline, "extrude"),
        "sketch_id": sketch_id,
        "body_id": body_ids[0],
        "body_ids": body_ids,
        "params": {
            **shared,
            "target_body_id": target_body_ids[0],
            "target_body_ids": target_body_ids,
            "engine": "browser_wasm",
        },
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id, objects,
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {
        "bodies": [{"body_id": body_id, "mesh": mesh} for body_id, (_body, mesh, _naming) in zip(body_ids, uploads)],
        "hidden_body_ids": target_body_ids,
    }
