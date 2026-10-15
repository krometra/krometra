"""Сохранение пересборки истории, выполненной браузерным ядром."""

import asyncio
import json
import math
from dataclasses import dataclass

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.schemas.ids import is_body_id, is_component_id
from app.services.document_service import get_document

from .browser_extrude import _error, is_browser_body, validated_browser_upload
from .browser_mirror import MIRROR_PLANES, check_mirror_rebuild
from .browser_naming import validated_browser_naming
from .browser_sketch_seat import apply_sketch_planes, feature_sketch_owner, seated_sketches, validated_sketch_planes
from .browser_storage import browser_body_objects, persist_replaced_bodies
from .limits import MAX_PARAMS_BYTES, MAX_REBUILD_BODIES

DIRECTIONS = {
    "extrude": ("one_side", "symmetric", "two_sided"),
    "revolve": ("one_side", "symmetric"),
    "shell": ("inward", "outward"),
}
POSITIVE = {"radius", "distance1", "distance2", "pitch", "length", "thickness"}
ORIENTATIONS = ("corrected", "frenet")
EDITABLE_PARAMS = {
    "extrude": {"distance", "direction", "back_distance", "offset"},
    "revolve": {"angle", "direction"},
    "sweep": {"orientation"},
    "fillet": {"radius"},
    "chamfer": {"distance1", "distance2"},
    "thread": {"pitch", "length", "offset"},
    "shell": {"thickness", "direction"},
    "mirror": {"plane", "offset"},
}


@dataclass(frozen=True)
class RebuiltBody:
    body_id: str
    step: bytes
    mesh_json: str
    naming_json: str | None


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _invalid(description: str):
    _error("invalid_rebuild_params", description)


def _validated_value(kind: str, key: str, value: object):
    if key == "direction":
        if value not in DIRECTIONS.get(kind, ()):
            _invalid("Недопустимое направление операции.")
        return value
    if key == "plane":
        if value not in MIRROR_PLANES:
            _invalid("Базовая плоскость зеркала — XY, XZ или YZ.")
        return value
    if key == "orientation":
        if value not in ORIENTATIONS:
            _invalid("Ориентация профиля протяжки — corrected или frenet.")
        return value
    if not _is_number(value):
        _invalid("Параметры операции должны быть конечными числами.")
    if key in POSITIVE and value <= 0:
        _invalid("Размер операции должен быть больше нуля.")
    if key == "distance" and abs(value) < 1e-9:
        _invalid("Расстояние выдавливания не может быть нулевым.")
    if key == "back_distance" and value < 0:
        _invalid("Обратное расстояние не может быть отрицательным.")
    if key == "angle" and not 0 < value <= 360:
        _invalid("Угол вращения должен быть в пределах (0, 360].")
    if kind == "thread" and key == "offset" and value < 0:
        _invalid("Отступ резьбы не может быть отрицательным.")
    return float(value)


def validated_rebuild_params(kind: str, params: object) -> dict:
    if params == {}:
        return {}
    allowed = EDITABLE_PARAMS.get(kind)
    if not allowed:
        _invalid("Эту операцию нельзя изменить задним числом.")
    if not isinstance(params, dict) or not set(params) <= allowed:
        _invalid(f"Для этой операции можно менять только: {', '.join(sorted(allowed))}.")
    return {key: _validated_value(kind, key, value) for key, value in params.items()}


def parse_rebuild_json(value: str, expected: type, description: str):
    if len(value.encode("utf-8")) > MAX_PARAMS_BYTES:
        _error("rebuild_params_too_large", "Параметры пересборки превышают 64 КБ.", status.HTTP_413_CONTENT_TOO_LARGE)
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        _invalid(description)
    if not isinstance(parsed, expected):
        _invalid(description)
    return parsed


def validated_rebuild_body_ids(body_ids: list) -> list[str]:
    if len(body_ids) > MAX_REBUILD_BODIES:
        _error(
            "too_many_rebuild_bodies",
            f"За одну пересборку можно обновить не больше {MAX_REBUILD_BODIES} тел.",
            status.HTTP_413_CONTENT_TOO_LARGE,
        )
    if not all(is_body_id(body_id) for body_id in body_ids):
        _error("invalid_body_id", "Некорректный идентификатор тела.")
    return body_ids


def _validated_uploads(bodies: list[RebuiltBody]) -> list[tuple[RebuiltBody, dict, dict | None]]:
    return [
        (body, validated_browser_upload(body.step, body.mesh_json), validated_browser_naming(body.naming_json))
        for body in bodies
    ]


def output_body(entry: dict) -> str | None:
    return entry.get("result_body_id") if entry.get("kind") == "boolean" else entry.get("body_id")


def input_bodies(entry: dict) -> set[str]:
    params = entry.get("params") or {}
    if entry.get("kind") == "boolean":
        ids = (entry.get("target_body_id"), entry.get("tool_body_id"))
    else:
        ids = (params.get("target_body_id"), params.get("up_to_body_id"))
    return {body_id for body_id in ids if isinstance(body_id, str) and body_id}


def dependency_bodies(entry: dict, components: dict) -> set[str]:
    owner = feature_sketch_owner(components, entry)
    return input_bodies(entry) | ({owner} if owner else set())


def affected_bodies(timeline: list, start: int, components: dict) -> set[str]:
    affected: set[str] = set()
    for offset, entry in enumerate(timeline[start:]):
        if offset > 0 and not dependency_bodies(entry, components) & affected:
            continue
        if (entry.get("params") or {}).get("engine") != "browser_wasm" or not output_body(entry):
            _error("rebuild_unsupported", "От изменённой операции зависит операция, которую браузерное ядро не пересобирает.")
        affected.add(output_body(entry))
    return affected


def _changed_entry(timeline: list, entry_id: str) -> int:
    index = next((i for i, entry in enumerate(timeline) if entry.get("id") == entry_id), None)
    if index is None:
        _error("entry_not_found", "Операция не найдена в истории.", status.HTTP_404_NOT_FOUND)
    if (timeline[index].get("params") or {}).get("engine") != "browser_wasm":
        _error("rebuild_unsupported", "Пересобрать можно только операцию браузерного ядра.")
    return index


async def save_browser_rebuild(
    project_id: str,
    user_id: str,
    entry_id: str,
    params: object,
    bodies: list[RebuiltBody],
    sketch_planes: dict,
    document_version: int,
    db: AsyncSession,
    storage: AsyncStorageClient,
) -> dict:
    if not is_component_id(entry_id):
        _error("entry_not_found", "Операция не найдена в истории.", status.HTTP_404_NOT_FOUND)
    validated_rebuild_body_ids([body.body_id for body in bodies])
    uploads = await asyncio.to_thread(_validated_uploads, bodies)
    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время пересборки в браузере.", status.HTTP_409_CONFLICT)
    timeline = [dict(entry) for entry in doc.timeline or []]
    index = _changed_entry(timeline, entry_id)
    changed = timeline[index]
    new_params = validated_rebuild_params(changed.get("kind"), params)
    check_mirror_rebuild(changed, new_params)
    components = dict(doc.components or {})
    affected = affected_bodies(timeline, index, components)
    uploaded = {body.body_id for body in bodies}
    if len(uploaded) != len(bodies) or uploaded != affected:
        _error("rebuild_bodies_mismatch", "Пересобранные тела не совпадают с зависимыми операциями.", status.HTTP_409_CONFLICT)
    planes = validated_sketch_planes(sketch_planes, seated_sketches(components, affected))

    if not all(is_browser_body(components.get(body_id)) for body_id in uploaded):
        _error("target_not_browser", "Браузерное ядро может изменять только browser-тела.")
    objects = []
    for body, mesh, naming in uploads:
        objects += await browser_body_objects(project_id, body.body_id, body.step, mesh, naming)
        components[body.body_id] = {**components[body.body_id], "bbox": mesh["bbox"]}

    timeline[index] = {**changed, "params": {**(changed.get("params") or {}), **new_params}}
    apply_sketch_planes(components, timeline, planes)
    output = output_body(changed)
    source = components[output].get("source") or {}
    components[output] = {**components[output], "source": {**source, **{k: v for k, v in new_params.items() if k in source}}}
    await persist_replaced_bodies(
        db, storage, project_id, user_id, objects,
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"bodies": [{"body_id": body.body_id, "mesh": mesh} for body, mesh, _naming in uploads]}
