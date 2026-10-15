"""Сохранение отверстий, вырезанных браузерным ядром."""

import datetime as dt
import json
import math
import uuid
from dataclasses import dataclass

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.schemas.ids import is_component_id
from app.services.document_service import get_document

from .browser_boolean import _visible_browser_body
from .browser_extrude import _error, checked_browser_upload
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id, next_label

HOLE_TYPES = ("simple", "counterbore", "countersink")
HOLE_EXTENTS = ("distance", "through_all")
HOLE_BOTTOMS = ("flat", "cone")
MAX_HOLES = 100


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _invalid_centers():
    _error("invalid_hole_centers", f"Центры отверстий задаются списком от 1 до {MAX_HOLES} точек [x, y, z].")


def parse_hole_centers(value: str) -> list[list[float]]:
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        _invalid_centers()
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_HOLES:
        _invalid_centers()
    if not all(isinstance(point, list) and len(point) == 3 and all(_is_number(item) for item in point) for point in raw):
        _invalid_centers()
    return [[float(item) for item in point] for point in raw]


@dataclass(frozen=True)
class BrowserHoleParams:
    face_id: str
    hole_type: str
    diameter: float
    extent: str
    depth: float
    bottom: str
    cbore_diameter: float
    cbore_depth: float
    csink_diameter: float
    csink_angle: float
    centers: tuple[tuple[float, float, float], ...]

    def validate(self) -> None:
        if not self.face_id:
            _error("invalid_hole_params", "Не задана грань под отверстие.")
        if self.hole_type not in HOLE_TYPES or self.extent not in HOLE_EXTENTS or self.bottom not in HOLE_BOTTOMS:
            _error("invalid_hole_params", "Неизвестный тип отверстия, предела или дна.")
        sizes = (self.diameter, self.depth, self.cbore_diameter, self.cbore_depth, self.csink_diameter, self.csink_angle)
        if not all(math.isfinite(value) and value > 0 for value in sizes):
            _error("invalid_hole_params", "Диаметры, глубины и угол отверстия должны быть больше нуля.")
        if self.csink_angle >= 180:
            _error("invalid_hole_params", "Угол зенковки задаётся в пределах от 0 до 180°.")
        if self.hole_type == "counterbore" and self.cbore_diameter <= self.diameter:
            _error("invalid_hole_params", "Диаметр цековки должен быть больше диаметра отверстия.")
        if self.hole_type == "countersink" and self.csink_diameter <= self.diameter:
            _error("invalid_hole_params", "Диаметр зенковки должен быть больше диаметра отверстия.")
        if not 1 <= len(self.centers) <= MAX_HOLES:
            _invalid_centers()

    def timeline_params(self, target_body_id: str, feature_key: str | None = None) -> dict:
        return {
            **({"feature_key": feature_key} if feature_key else {}),
            "face_id": self.face_id,
            "hole_type": self.hole_type,
            "diameter": self.diameter,
            "extent": self.extent,
            "depth": self.depth,
            "bottom": self.bottom,
            "cbore_diameter": self.cbore_diameter,
            "cbore_depth": self.cbore_depth,
            "csink_diameter": self.csink_diameter,
            "csink_angle": self.csink_angle,
            "centers": [list(center) for center in self.centers],
            "target_body_id": target_body_id,
            "engine": "browser_wasm",
        }


def _checked_sketch(components: dict, sketch_id: str | None) -> str | None:
    if sketch_id in (None, ""):
        return None
    sketch = components.get(sketch_id) if is_component_id(sketch_id) else None
    if not isinstance(sketch, dict) or not isinstance(sketch.get("entities"), list):
        _error("sketch_not_found", "Эскиз с центрами отверстий не найден.", status.HTTP_404_NOT_FOUND)
    return sketch_id


async def save_browser_hole(
    project_id: str,
    user_id: str,
    body_id: str,
    params: BrowserHoleParams,
    sketch_id: str | None,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    params.validate()
    mesh = await checked_browser_upload(step_bytes, mesh_json)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    target = _visible_browser_body(components, body_id)
    sketch = _checked_sketch(components, sketch_id)

    result_body_id = new_body_id()
    components[result_body_id] = {
        "type": "body",
        "source": {"kind": "browser_hole", "target_body_id": body_id, "face_id": params.face_id},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    components[body_id] = {**target, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "hole",
        "label": next_label(timeline, "hole"),
        "body_id": result_body_id,
        **({"sketch_id": sketch} if sketch else {}),
        "params": params.timeline_params(body_id, feature_key),
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, result_body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": result_body_id, "mesh": mesh, "hole_count": len(params.centers)}
