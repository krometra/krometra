"""Сохранение выдавливания, построенного экспериментальным браузерным ядром."""

import asyncio
import datetime as dt
import json
import math
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.schemas.geometry import MeshResponse
from app.schemas.ids import is_body_id, is_component_id
from app.services.document_service import get_document

from .browser_storage import browser_body_objects, persist_new_body
from .common import browser_step_key, new_body_id, next_label
from .limits import (
    MAX_EDGE_REFERENCES,
    MAX_MESH_BYTES,
    MAX_MESH_EDGES,
    MAX_MESH_FACES,
    MAX_MESH_POLYLINE_VALUES,
    MAX_MESH_TRIANGLES,
    MAX_MESH_VERTICES,
    MAX_STEP_BYTES,
)
from .target_resolution import resolve_target_body

def _error(code: str, description: str, http_status: int = status.HTTP_400_BAD_REQUEST):
    raise HTTPException(status_code=http_status, detail={"error": code, "error_description": description})


def _items(value: object) -> list:
    return value if isinstance(value, list) else []


def _mesh_complexity(raw: dict) -> list[tuple[int, int]]:
    topo = raw.get("brep_topo") if isinstance(raw.get("brep_topo"), dict) else {}
    faces = [face for face in _items(topo.get("faces")) if isinstance(face, dict)]
    edges = [edge for edge in _items(topo.get("edges")) if isinstance(edge, dict)]
    references = sum(len(_items(face.get("edges"))) for face in faces) + sum(len(_items(edge.get("vertices"))) for edge in edges)
    return [
        (len(_items(raw.get("vertices"))) // 3, MAX_MESH_VERTICES),
        (len(_items(raw.get("indices"))) // 3, MAX_MESH_TRIANGLES),
        (len(_items(topo.get("faces"))), MAX_MESH_FACES),
        (len(_items(topo.get("edges"))), MAX_MESH_EDGES),
        (sum(len(_items(edge.get("polyline"))) for edge in edges), MAX_MESH_POLYLINE_VALUES),
        (references, MAX_EDGE_REFERENCES),
    ]


def _parsed_browser_mesh(mesh_json: str) -> dict:
    try:
        raw = json.loads(mesh_json)
    except json.JSONDecodeError:
        _error("invalid_browser_mesh", "Браузерное ядро вернуло некорректный меш.")
    if not isinstance(raw, dict):
        _error("invalid_browser_mesh", "Браузерное ядро вернуло некорректный меш.")
    if any(count > limit for count, limit in _mesh_complexity(raw)):
        _error(
            "browser_mesh_too_complex",
            f"Меш слишком детализирован: допускается до {MAX_MESH_VERTICES} вершин, {MAX_MESH_TRIANGLES} треугольников, "
            f"{MAX_MESH_FACES} граней и {MAX_MESH_EDGES} рёбер.",
            status.HTTP_413_CONTENT_TOO_LARGE,
        )
    try:
        return MeshResponse(**raw).model_dump()
    except (TypeError, ValueError):
        _error("invalid_browser_mesh", "Браузерное ядро вернуло некорректный меш.")


def _validated_browser_mesh(mesh_json: str) -> dict:
    mesh = _parsed_browser_mesh(mesh_json)
    vertices = mesh["vertices"]
    indices = mesh["indices"]
    triangle_faces = mesh["face_triangle_map"]
    if not vertices or len(vertices) % 3 or not indices or len(indices) % 3:
        _error("invalid_browser_mesh", "Меш должен содержать вершины и целые треугольники.")
    if len(triangle_faces) != len(indices) // 3:
        _error("invalid_browser_mesh", "Карта треугольников не соответствует мешу.")
    if not all(math.isfinite(value) for value in vertices):
        _error("invalid_browser_mesh", "Координаты меша должны быть конечными числами.")
    vertex_count = len(vertices) // 3
    if min(indices) < 0 or max(indices) >= vertex_count:
        _error("invalid_browser_mesh", "Индекс треугольника выходит за границы вершин.")

    bbox = mesh["bbox"]
    if len(bbox["min"]) != 3 or len(bbox["max"]) != 3 or any(
        not math.isfinite(value) for value in [*bbox["min"], *bbox["max"]]
    ):
        _error("invalid_browser_mesh", "Габариты меша должны состоять из конечных координат.")
    if any(low > high for low, high in zip(bbox["min"], bbox["max"])):
        _error("invalid_browser_mesh", "Минимум габаритов не может быть больше максимума.")
    actual_bbox = {
        "min": [min(vertices[axis::3]) for axis in range(3)],
        "max": [max(vertices[axis::3]) for axis in range(3)],
    }
    if any(
        not math.isclose(actual, declared, rel_tol=1e-9, abs_tol=1e-9)
        for side in ("min", "max")
        for actual, declared in zip(actual_bbox[side], bbox[side])
    ):
        _error("invalid_browser_mesh", "Габариты меша не соответствуют его вершинам.")
    face_ids = [face["face_id"] for face in mesh["brep_topo"]["faces"]]
    known_faces = set(face_ids)
    if len(face_ids) != len(known_faces):
        _error("invalid_browser_mesh", "Идентификаторы граней меша должны быть уникальны.")
    if not known_faces or not known_faces.issuperset(triangle_faces):
        _error("invalid_browser_mesh", "Карта треугольников ссылается на неизвестную грань.")
    return mesh


def validated_browser_upload(step_bytes: bytes, mesh_json: str) -> dict:
    if not step_bytes:
        _error("empty_browser_step", "Браузерное ядро не вернуло STEP-файл.")
    if len(step_bytes) > MAX_STEP_BYTES:
        _error("browser_step_too_large", "STEP-файл браузерной операции превышает 10 МБ.", 413)
    if len(mesh_json.encode("utf-8")) > MAX_MESH_BYTES:
        _error("browser_mesh_too_large", "Меш браузерной операции превышает 50 МБ.", 413)
    return _validated_browser_mesh(mesh_json)


async def checked_browser_upload(step_bytes: bytes, mesh_json: str) -> dict:
    return await asyncio.to_thread(validated_browser_upload, step_bytes, mesh_json)


def is_browser_body(body: object) -> bool:
    source = body.get("source") if isinstance(body, dict) else None
    return isinstance(source, dict) and str(source.get("kind", "")).startswith("browser_")


def _browser_boolean_target(components: dict, operation: str, target_body_id: str | None) -> str | None:
    if operation == "new_body":
        return None
    if operation not in ("join", "cut"):
        _error("invalid_extrude_params", "Поддерживаются операции new_body, join и cut.")
    if resolve_target_body(components, target_body_id) != target_body_id:
        _error("target_changed", "Целевое тело изменилось во время построения в браузере.", status.HTTP_409_CONFLICT)
    if not is_browser_body(components[target_body_id]):
        _error("target_not_browser", "Браузерное ядро может изменять только browser-тела.")
    return target_body_id


EXTENT_TYPES = ("distance", "through_all", "up_to_face", "up_to_body")


def browser_extent_params(
    components: dict,
    operation: str,
    direction: str,
    extent_type: str,
    back_distance: float,
    offset: float,
    up_to_body_id: str | None,
    up_to_face_id: str | None,
) -> dict:
    if extent_type not in EXTENT_TYPES:
        _error("invalid_extrude_params", "Поддерживаются границы distance, through_all, up_to_face и up_to_body.")
    if not math.isfinite(back_distance) or back_distance < 0 or not math.isfinite(offset):
        _error("invalid_extrude_params", "Обратное расстояние и смещение должны быть конечными числами.")
    params: dict = {"extent_type": extent_type}
    if direction == "two_sided":
        if back_distance < 1e-9:
            _error("invalid_extrude_params", "Для выдавливания в обе стороны нужно обратное расстояние больше нуля.")
        params["back_distance"] = back_distance
    if extent_type == "through_all" and operation == "new_body":
        _error("through_all_new_body", "Выдавливание насквозь доступно только для приклеивания и выреза.")
    if extent_type in ("up_to_face", "up_to_body"):
        if direction == "symmetric":
            _error("invalid_extrude_params", "Симметричное выдавливание доступно только на расстояние или насквозь.")
        if not up_to_body_id or not is_browser_body(components.get(up_to_body_id)):
            _error("up_to_target_required", "Выдавливание «до» требует browser-тело в качестве цели.")
        if extent_type == "up_to_face" and not up_to_face_id:
            _error("up_to_face_required", "Выдавливание «до грани» требует идентификатор грани.")
        params.update({"offset": offset, "up_to_body_id": up_to_body_id})
        if extent_type == "up_to_face":
            params["up_to_face_id"] = up_to_face_id
    return params


def parse_revolve_origin(value: str) -> dict[str, float]:
    try:
        origin = json.loads(value)
    except json.JSONDecodeError:
        _error("invalid_revolve_params", "Некорректная ось вращения.")
    if (
        not isinstance(origin, dict)
        or set(origin) != {"x", "y"}
        or not all(isinstance(origin[axis], (int, float)) and math.isfinite(origin[axis]) for axis in ("x", "y"))
    ):
        _error("invalid_revolve_params", "Некорректная ось вращения.")
    return {axis: float(origin[axis]) for axis in ("x", "y")}


async def save_browser_extrude(
    project_id: str,
    user_id: str,
    sketch_id: str,
    distance: float,
    direction: str,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    feature_kind: str = "extrude",
    axis_origin: dict | None = None,
    axis: str | None = None,
    angle: float | None = None,
    operation: str = "new_body",
    target_body_id: str | None = None,
    naming: dict | None = None,
    feature_key: str | None = None,
    extent_type: str = "distance",
    back_distance: float = 0.0,
    offset: float = 0.0,
    up_to_body_id: str | None = None,
    up_to_face_id: str | None = None,
) -> dict:
    if not is_component_id(sketch_id):
        _error("invalid_sketch_id", "Некорректный идентификатор эскиза.")
    mesh = await checked_browser_upload(step_bytes, mesh_json)
    directions = ("one_side", "symmetric", "two_sided") if feature_kind == "extrude" else ("one_side", "symmetric")
    if direction not in directions:
        _error("invalid_extrude_params", f"Поддерживаются направления {', '.join(directions)}.")
    if feature_kind == "extrude" and abs(distance) < 1e-9:
        _error("zero_distance", "Расстояние выдавливания не может быть нулевым.")

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    sketch = (doc.components or {}).get(sketch_id)
    if not isinstance(sketch, dict) or not isinstance(sketch.get("entities"), list):
        _error("sketch_not_found", f"Эскиз '{sketch_id}' не найден.", status.HTTP_404_NOT_FOUND)
    components = dict(doc.components or {})
    target_body_id = _browser_boolean_target(components, operation, target_body_id)
    extent_params = browser_extent_params(
        components, operation, direction, extent_type, back_distance, offset, up_to_body_id, up_to_face_id,
    ) if feature_kind == "extrude" else {}

    body_id = new_body_id()
    timeline = list(doc.timeline or [])
    target_params = {"target_body_id": target_body_id} if target_body_id else {}
    key_params = {"feature_key": feature_key} if feature_key else {}
    hidden_body_ids = [target_body_id] if target_body_id else []
    for hidden_body_id in hidden_body_ids:
        components[hidden_body_id] = {**components[hidden_body_id], "visible": False}
    components[body_id] = {
        "type": "body",
        "source": {
            "kind": f"browser_{feature_kind}",
            "sketch_id": sketch_id,
            **({"distance": distance} if feature_kind == "extrude" else {"axis_origin": axis_origin, "axis": axis, "angle": angle}),
            "direction": direction,
            "operation": operation,
            **target_params,
            **key_params,
            **extent_params,
        },
        "visible": True,
        "bbox": mesh["bbox"],
    }
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": feature_kind,
        "label": next_label(timeline, feature_kind),
        "sketch_id": sketch_id,
        "body_id": body_id,
        "params": {
            **({"distance": distance} if feature_kind == "extrude" else {"axis_origin": axis_origin, "axis": axis, "angle": angle}),
            "direction": direction,
            "operation": operation,
            **target_params,
            **key_params,
            **extent_params,
            "engine": "browser_wasm",
        },
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": body_id, "mesh": mesh, "hidden_body_ids": hidden_body_ids}


async def load_browser_step(
    project_id: str,
    body_id: str,
    user_id: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
) -> bytes:
    """Вернуть исходный STEP browser-тела, не интерпретируя его на сервере."""
    doc = await get_document(db, project_id, user_id)
    if not is_body_id(body_id) or not is_browser_body((doc.components or {}).get(body_id)):
        _error("browser_step_not_found", "Браузерная геометрия не найдена.", status.HTTP_404_NOT_FOUND)

    step = await storage.get_object(browser_step_key(project_id, body_id))
    if not step:
        _error("browser_step_not_found", "Браузерная геометрия не найдена.", status.HTTP_404_NOT_FOUND)
    return step
