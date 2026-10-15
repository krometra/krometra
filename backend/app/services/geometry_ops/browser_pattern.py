"""Сохранение массива тел, построенного браузерным ядром."""

import asyncio
import datetime as dt
import uuid

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.services.document_service import get_document

from .browser_boolean import _visible_browser_body
from .browser_extrude import _error, is_browser_body
from .browser_import import ImportedBody, _validated_uploads
from .browser_pattern_params import instance_count, pattern_reference_bodies
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id, next_label


def expected_body_count(params: dict) -> int:
    return 1 if params["mode"] == "join" else instance_count(params) - 1


def _checked_references(components: dict, params: dict) -> None:
    for body_id in pattern_reference_bodies(params):
        if not is_browser_body(components.get(body_id)):
            _error(
                "pattern_axis_missing",
                "Тело, задающее ось массива, не найдено — выберите ось заново.",
                status.HTTP_409_CONFLICT,
            )


def _timeline_entry(timeline: list, body_ids: list[str], params: dict) -> dict:
    outputs = {"body_ids": body_ids} if params["mode"] == "separate" else {}
    return {
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "pattern",
        "label": next_label(timeline, "pattern"),
        "body_id": body_ids[0],
        **outputs,
        "params": {**params, "engine": "browser_wasm"},
        "status": "ok",
    }


async def save_browser_pattern(
    project_id: str,
    user_id: str,
    body_id: str,
    params: dict,
    bodies: list[ImportedBody],
    document_version: int,
    db: AsyncSession,
    storage: AsyncStorageClient,
    feature_key: str | None = None,
) -> dict:
    if len(bodies) != expected_body_count(params):
        _error("pattern_bodies_mismatch", "Число построенных тел не совпадает с параметрами массива.")
    uploads = await asyncio.to_thread(_validated_uploads, bodies)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    source = _visible_browser_body(components, body_id)
    _checked_references(components, params)

    stored = {"target_body_id": body_id, **params, **({"feature_key": feature_key} if feature_key else {})}
    body_ids: list[str] = []
    objects = []
    for instance, (body, mesh, naming) in enumerate(uploads, start=1):
        result_body_id = new_body_id()
        components[result_body_id] = {
            "type": "body",
            "source": {"kind": "browser_pattern", "target_body_id": body_id, "mode": params["mode"], "instance": instance},
            "visible": True,
            "bbox": mesh["bbox"],
        }
        objects += await browser_body_objects(project_id, result_body_id, body.step, mesh, naming)
        body_ids.append(result_body_id)
    hidden_body_ids = [body_id] if params["mode"] == "join" else []
    if hidden_body_ids:
        components[body_id] = {**source, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append(_timeline_entry(timeline, body_ids, stored))
    await persist_new_body(
        db, storage, project_id, user_id, objects,
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {
        "bodies": [{"body_id": result_body_id, "mesh": mesh} for result_body_id, (_body, mesh, _naming) in zip(body_ids, uploads)],
        "hidden_body_ids": hidden_body_ids,
    }
