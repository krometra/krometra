"""Схлопывание хвоста browser-скруглений в одну операцию, пересобранную от родителя."""

import json

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.schemas.ids import is_component_id
from app.services.document_service import get_document

from .browser_boolean import _visible_browser_body
from .browser_edge_feature import validated_edge_params
from .browser_extrude import _error, checked_browser_upload
from .browser_sketch_seat import reassign_sketch_owner
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id

MAX_RUN_ENTRIES = 100


def parse_entry_ids(value: str) -> list[str]:
    try:
        ids = json.loads(value)
    except json.JSONDecodeError:
        _error("invalid_entry_ids", "Некорректный список операций.")
    if (
        not isinstance(ids, list)
        or not 0 < len(ids) <= MAX_RUN_ENTRIES
        or not all(is_component_id(entry_id) for entry_id in ids)
        or len(set(ids)) != len(ids)
    ):
        _error("invalid_entry_ids", "Нужен непустой список уникальных операций.")
    return ids


def _run_conflict():
    _error("fillet_run_changed", "Скругления в истории изменились во время построения.", status.HTTP_409_CONFLICT)


def _input_bodies(entry: dict) -> set:
    params = entry.get("params") or {}
    return {
        body_id
        for body_id in (
            params.get("target_body_id"),
            params.get("up_to_body_id"),
            entry.get("target_body_id"),
            entry.get("tool_body_id"),
        )
        if body_id
    }


def _fillet_run(timeline: list, entry_ids: list[str], radius: float) -> list[dict]:
    by_id = {entry.get("id"): entry for entry in timeline}
    run = [by_id.get(entry_id) for entry_id in entry_ids]
    for index, entry in enumerate(run):
        params = (entry or {}).get("params") or {}
        if (
            entry is None
            or entry.get("kind") != "fillet"
            or params.get("engine") != "browser_wasm"
            or abs(float(params.get("radius", 0.0)) - radius) > 1e-9
            or (index > 0 and params.get("target_body_id") != run[index - 1].get("body_id"))
        ):
            _run_conflict()
    return run


def _check_run_is_tail(timeline: list, run: list[dict]) -> None:
    run_ids = {entry["id"] for entry in run}
    outputs = {entry.get("body_id") for entry in run}
    for entry in timeline:
        consumed = _input_bodies(entry) & outputs
        if not consumed:
            continue
        if entry.get("id") not in run_ids or consumed & {run[-1].get("body_id")}:
            _run_conflict()


async def save_browser_fillet_merge(
    project_id: str,
    user_id: str,
    entry_ids: list[str],
    edge_names: list[str],
    radius: float,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    params = validated_edge_params("fillet", {"radius": radius})
    mesh = await checked_browser_upload(step_bytes, mesh_json)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    timeline = list(doc.timeline or [])
    run = _fillet_run(timeline, entry_ids, params["radius"])
    _check_run_is_tail(timeline, run)
    components = dict(doc.components or {})
    last_body_id = run[-1].get("body_id")
    _visible_browser_body(components, last_body_id)
    parent_body_id = run[0]["params"].get("target_body_id")
    if not isinstance(components.get(parent_body_id), dict):
        _run_conflict()

    result_body_id = new_body_id()
    key = feature_key or run[0]["params"].get("feature_key")
    key_params = {"feature_key": key} if key else {}
    superseded_bodies = [entry.get("body_id") for entry in run]
    for body_id in superseded_bodies:
        components.pop(body_id, None)
    reassign_sketch_owner(components, set(superseded_bodies), result_body_id)
    components[result_body_id] = {
        "type": "body",
        "source": {
            "kind": "browser_fillet",
            "target_body_id": parent_body_id,
            "edge_ids": edge_names,
            **params,
            **key_params,
        },
        "visible": True,
        "bbox": mesh["bbox"],
    }

    base = run[0]
    merged = {
        **base,
        "body_id": result_body_id,
        "params": {
            **base["params"],
            "target_body_id": parent_body_id,
            "edge_ids": edge_names,
            **params,
            **key_params,
            "engine": "browser_wasm",
        },
        "status": "ok",
    }
    superseded = {entry["id"] for entry in run[1:]}
    new_timeline = [merged if entry.get("id") == base["id"] else entry for entry in timeline if entry.get("id") not in superseded]

    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, result_body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=new_timeline, version=doc.version),
    )
    return {"body_id": result_body_id, "mesh": mesh, "hidden_body_ids": superseded_bodies}
