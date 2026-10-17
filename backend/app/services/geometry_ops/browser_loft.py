"""Сохранение лофта, построенного браузерным ядром по профилям из нескольких эскизов."""

import datetime as dt
import json
import uuid
from dataclasses import dataclass

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.schemas.ids import is_component_id
from app.services.document_service import get_document

from .browser_extrude import _browser_boolean_target, _error, checked_browser_upload
from .browser_storage import browser_body_objects, persist_new_body
from .browser_sweep import _require_sketch
from .common import new_body_id, next_label

TRANSITIONS = ("smooth", "ruled")
MAX_LOFT_PROFILES = 32


@dataclass(frozen=True)
class BrowserLoftParams:
    profile_sketch_ids: tuple[str, ...]
    transition: str
    operation: str
    target_body_id: str | None


def parsed_profile_sketch_ids(value: str) -> tuple[str, ...]:
    try:
        ids = json.loads(value)
    except ValueError:
        _error("invalid_loft_params", "Профили лофта передаются JSON-списком идентификаторов эскизов.")
    if not isinstance(ids, list) or not all(isinstance(sketch_id, str) for sketch_id in ids):
        _error("invalid_loft_params", "Профили лофта передаются JSON-списком идентификаторов эскизов.")
    return tuple(ids)


def validated_loft_params(params: BrowserLoftParams) -> BrowserLoftParams:
    ids = params.profile_sketch_ids
    if not all(is_component_id(sketch_id) for sketch_id in ids):
        _error("invalid_sketch_id", "Некорректный идентификатор эскиза.")
    if not 2 <= len(ids) <= MAX_LOFT_PROFILES:
        _error("invalid_loft_params", f"Лофт строится по 2-{MAX_LOFT_PROFILES} профилям.")
    if len(set(ids)) != len(ids):
        _error("invalid_loft_params", "Эскизы профилей лофта не должны повторяться.")
    if params.transition not in TRANSITIONS:
        _error("invalid_loft_params", "Переход лофта - smooth или ruled.")
    return params


async def save_browser_loft(
    project_id: str,
    user_id: str,
    params: BrowserLoftParams,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    validated_loft_params(params)
    mesh = await checked_browser_upload(step_bytes, mesh_json)
    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    for sketch_id in params.profile_sketch_ids:
        _require_sketch(components, sketch_id)
    target_body_id = _browser_boolean_target(components, params.operation, params.target_body_id)

    body_id = new_body_id()
    feature = {
        "profile_sketch_ids": list(params.profile_sketch_ids),
        "transition": params.transition,
        "operation": params.operation,
        **({"target_body_id": target_body_id} if target_body_id else {}),
        **({"feature_key": feature_key} if feature_key else {}),
    }
    hidden_body_ids = [target_body_id] if target_body_id else []
    for hidden_body_id in hidden_body_ids:
        components[hidden_body_id] = {**components[hidden_body_id], "visible": False}
    first_sketch_id = params.profile_sketch_ids[0]
    components[body_id] = {
        "type": "body",
        "source": {"kind": "browser_loft", "sketch_id": first_sketch_id, **feature},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "loft",
        "label": next_label(timeline, "loft"),
        "sketch_id": first_sketch_id,
        "body_id": body_id,
        "params": {**feature, "engine": "browser_wasm"},
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": body_id, "mesh": mesh, "hidden_body_ids": hidden_body_ids}
