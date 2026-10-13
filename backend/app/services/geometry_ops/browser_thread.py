"""Сохранение резьбы, нарезанной браузерным ядром."""

import datetime as dt
import math
import uuid
from dataclasses import dataclass

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.services.document_service import get_document

from .browser_boolean import _visible_browser_body
from .browser_extrude import _error, checked_browser_upload
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id, next_label


@dataclass(frozen=True)
class BrowserThreadParams:
    face_id: str
    pitch: float
    depth: float
    length: float
    offset: float
    crest_ratio: float
    starts: int
    right_handed: bool
    external: bool
    diameter: float

    def validate(self) -> None:
        positive = (self.pitch, self.depth, self.length, self.diameter)
        if not self.face_id or not all(math.isfinite(value) and value > 0 for value in positive):
            _error("invalid_thread_params", "Шаг, глубина, длина и диаметр резьбы должны быть больше нуля.")
        if not math.isfinite(self.offset) or self.offset < 0:
            _error("invalid_thread_params", "Отступ резьбы не может быть отрицательным.")
        if not 0 <= self.crest_ratio < 1:
            _error("invalid_thread_params", "Ширина вершины профиля задаётся долей шага от 0 до 1.")
        if self.starts < 1:
            _error("invalid_thread_params", "Число заходов резьбы — минимум 1.")

    def timeline_params(self, target_body_id: str, feature_key: str | None = None) -> dict:
        return {
            **({"feature_key": feature_key} if feature_key else {}),
            "face_id": self.face_id,
            "pitch": self.pitch,
            "depth": self.depth,
            "length": self.length,
            "offset": self.offset,
            "crest_ratio": self.crest_ratio,
            "starts": self.starts,
            "right_handed": self.right_handed,
            "kind": "external" if self.external else "internal",
            "target_body_id": target_body_id,
            "engine": "browser_wasm",
        }


async def save_browser_thread(
    project_id: str,
    user_id: str,
    body_id: str,
    params: BrowserThreadParams,
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

    result_body_id = new_body_id()
    components[result_body_id] = {
        "type": "body",
        "source": {"kind": "browser_thread", "target_body_id": body_id, "face_id": params.face_id},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    components[body_id] = {**target, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "thread",
        "label": next_label(timeline, "thread"),
        "body_id": result_body_id,
        "params": params.timeline_params(body_id, feature_key),
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, result_body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {
        "body_id": result_body_id,
        "mesh": mesh,
        "external": params.external,
        "diameter": params.diameter,
        "length": params.length,
        "pitch": params.pitch,
        "depth": params.depth,
        "starts": params.starts,
    }
