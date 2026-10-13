"""Сохранение скругления и фаски, построенных браузерным ядром."""

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

EDGE_FEATURE_PARAMS = {"fillet": ("radius",), "chamfer": ("distance1", "distance2")}
MAX_EDGE_NAMES = 1000


def parse_edge_names(value: str) -> list[str]:
    try:
        names = json.loads(value)
    except json.JSONDecodeError:
        _error("invalid_edge_ids", "Некорректный список рёбер.")
    if (
        not isinstance(names, list)
        or not 0 < len(names) <= MAX_EDGE_NAMES
        or not all(isinstance(name, str) and 0 < len(name) <= 200 for name in names)
        or len(set(names)) != len(names)
    ):
        _error("invalid_edge_ids", "Нужен непустой список уникальных имён рёбер.")
    return names


def validated_edge_params(kind: str, params: dict) -> dict:
    keys = EDGE_FEATURE_PARAMS.get(kind)
    if keys is None:
        _error("invalid_edge_feature", "Поддерживаются только скругление и фаска.")
    values = {key: params.get(key) for key in keys}
    if not all(
        isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0
        for value in values.values()
    ):
        _error("invalid_edge_feature", "Размеры скругления и фаски должны быть положительными.")
    return {key: float(value) for key, value in values.items()}


async def save_browser_edge_feature(
    project_id: str,
    user_id: str,
    kind: str,
    body_id: str,
    edge_names: list[str],
    params: dict,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    feature_params = validated_edge_params(kind, params)
    mesh = await checked_browser_upload(step_bytes, mesh_json)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    source = _visible_browser_body(components, body_id)

    result_body_id = new_body_id()
    key_params = {"feature_key": feature_key} if feature_key else {}
    components[result_body_id] = {
        "type": "body",
        "source": {"kind": f"browser_{kind}", "target_body_id": body_id, "edge_ids": edge_names, **feature_params, **key_params},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    components[body_id] = {**source, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": kind,
        "label": next_label(timeline, kind),
        "body_id": result_body_id,
        "params": {
            "target_body_id": body_id,
            "edge_ids": edge_names,
            **feature_params,
            **key_params,
            "engine": "browser_wasm",
        },
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, result_body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": result_body_id, "mesh": mesh, "hidden_body_ids": [body_id]}
