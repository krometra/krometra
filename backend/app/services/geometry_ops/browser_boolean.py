"""Сохранение булевой операции, выполненной браузерным ядром."""

import datetime as dt
import uuid

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.services.document_service import get_document

from .browser_extrude import _error, checked_browser_upload, is_browser_body
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id, next_label

BROWSER_BOOLEAN_OPERATIONS = ("union", "subtract", "intersect")


def _visible_browser_body(components: dict, body_id: str) -> dict:
    body = components.get(body_id)
    if not isinstance(body, dict) or body.get("type") != "body" or body.get("visible") is False:
        _error("target_changed", "Тело изменилось во время построения в браузере.", status.HTTP_409_CONFLICT)
    if not is_browser_body(body):
        _error("target_not_browser", "Браузерное ядро может изменять только browser-тела.")
    return body


async def save_browser_boolean(
    project_id: str,
    user_id: str,
    operation: str,
    target_body_id: str,
    tool_body_id: str,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    if operation not in BROWSER_BOOLEAN_OPERATIONS:
        _error("invalid_boolean_params", "Поддерживаются операции union, subtract и intersect.")
    if target_body_id == tool_body_id:
        _error("invalid_boolean_params", "Целевое тело и инструмент должны различаться.")
    mesh = await checked_browser_upload(step_bytes, mesh_json)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    target = _visible_browser_body(components, target_body_id)
    tool = _visible_browser_body(components, tool_body_id)

    body_id = new_body_id()
    components[body_id] = {
        "type": "body",
        "source": {
            "kind": "browser_boolean",
            "operation": operation,
            "target_body_id": target_body_id,
            "tool_body_id": tool_body_id,
        },
        "visible": True,
        "bbox": mesh["bbox"],
    }
    components[target_body_id] = {**target, "visible": False}
    components[tool_body_id] = {**tool, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "boolean",
        "label": next_label(timeline, "boolean"),
        "operation": operation,
        "result_body_id": body_id,
        "target_body_id": target_body_id,
        "tool_body_id": tool_body_id,
        "params": {**({"feature_key": feature_key} if feature_key else {}), "engine": "browser_wasm"},
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"result_body_id": body_id, "mesh": mesh}
