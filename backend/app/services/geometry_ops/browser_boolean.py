"""Сохранение булевой операции, выполненной браузерным ядром."""

import datetime as dt
import json
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
MAX_BOOLEAN_TOOLS = 32


def _visible_browser_body(components: dict, body_id: str) -> dict:
    body = components.get(body_id)
    if not isinstance(body, dict) or body.get("type") != "body" or body.get("visible") is False:
        _error("target_changed", "Тело изменилось во время построения в браузере.", status.HTTP_409_CONFLICT)
    if not is_browser_body(body):
        _error("target_not_browser", "Браузерное ядро может изменять только browser-тела.")
    return body


def parse_tool_body_ids(tool_body_id: str, tool_body_ids: str | None) -> list[str]:
    if tool_body_ids is None:
        return [tool_body_id]
    try:
        tools = json.loads(tool_body_ids)
    except json.JSONDecodeError:
        tools = None
    if not isinstance(tools, list) or not tools or not all(isinstance(tool, str) and tool for tool in tools):
        _error("invalid_boolean_params", "Список тел-инструментов должен быть непустым массивом идентификаторов.")
    if len(tools) > MAX_BOOLEAN_TOOLS:
        _error("invalid_boolean_params", f"За одну операцию можно взять не больше {MAX_BOOLEAN_TOOLS} тел-инструментов.")
    if len(set(tools)) != len(tools):
        _error("invalid_boolean_params", "Тело-инструмент указано дважды.")
    if tools[0] != tool_body_id:
        _error("invalid_boolean_params", "Первый инструмент списка должен совпадать с tool_body_id.")
    return tools


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
    keep_tools: bool = False,
    tool_body_ids: list[str] | None = None,
) -> dict:
    tool_body_ids = tool_body_ids or [tool_body_id]
    if operation not in BROWSER_BOOLEAN_OPERATIONS:
        _error("invalid_boolean_params", "Поддерживаются операции union, subtract и intersect.")
    if target_body_id in tool_body_ids:
        _error("invalid_boolean_params", "Целевое тело и инструмент должны различаться.")
    mesh = await checked_browser_upload(step_bytes, mesh_json)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    target = _visible_browser_body(components, target_body_id)
    tools = {tool_body_id: _visible_browser_body(components, tool_body_id) for tool_body_id in tool_body_ids}
    tool_refs = {"tool_body_id": tool_body_ids[0], **({"tool_body_ids": tool_body_ids} if len(tool_body_ids) > 1 else {})}
    keep_params = {"keep_tools": True} if keep_tools else {}

    body_id = new_body_id()
    components[body_id] = {
        "type": "body",
        "source": {"kind": "browser_boolean", "operation": operation, "target_body_id": target_body_id, **tool_refs, **keep_params},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    components[target_body_id] = {**target, "visible": False}
    if not keep_tools:
        for tool_body_id, tool in tools.items():
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
        **tool_refs,
        "params": {**({"feature_key": feature_key} if feature_key else {}), **keep_params, "engine": "browser_wasm"},
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"result_body_id": body_id, "mesh": mesh}
