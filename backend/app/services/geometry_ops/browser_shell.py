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

SHELL_DIRECTIONS = ("inward", "outward")
MAX_FACE_NAMES = 1000


def parse_face_names(value: str) -> list[str]:
    try:
        names = json.loads(value)
    except json.JSONDecodeError:
        _error("invalid_face_ids", "Некорректный список граней.")
    if (
        not isinstance(names, list)
        or not 0 < len(names) <= MAX_FACE_NAMES
        or not all(isinstance(name, str) and 0 < len(name) <= 200 for name in names)
        or len(set(names)) != len(names)
    ):
        _error("invalid_face_ids", "Нужен непустой список уникальных имён граней.")
    return names


def validated_shell_params(thickness: object, direction: object) -> dict:
    if (
        not isinstance(thickness, (int, float))
        or isinstance(thickness, bool)
        or not math.isfinite(thickness)
        or thickness <= 0
    ):
        _error("invalid_shell_params", "Толщина стенки оболочки должна быть больше нуля.")
    if direction not in SHELL_DIRECTIONS:
        _error("invalid_shell_params", "Оболочка строится внутрь или наружу тела.")
    return {"thickness": float(thickness), "direction": direction}


async def save_browser_shell(
    project_id: str,
    user_id: str,
    body_id: str,
    face_names: list[str],
    params: dict,
    document_version: int,
    step_bytes: bytes,
    mesh_json: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
    naming: dict | None = None,
    feature_key: str | None = None,
) -> dict:
    shell_params = validated_shell_params(params.get("thickness"), params.get("direction"))
    mesh = await checked_browser_upload(step_bytes, mesh_json)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время построения в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    source = _visible_browser_body(components, body_id)

    result_body_id = new_body_id()
    key_params = {"feature_key": feature_key} if feature_key else {}
    shell = {"target_body_id": body_id, "face_ids": face_names, **shell_params}
    components[result_body_id] = {
        "type": "body",
        "source": {"kind": "browser_shell", **shell, **key_params},
        "visible": True,
        "bbox": mesh["bbox"],
    }
    components[body_id] = {**source, "visible": False}

    timeline = list(doc.timeline or [])
    timeline.append({
        "id": f"tl-{uuid.uuid4().hex[:12]}",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "kind": "shell",
        "label": next_label(timeline, "shell"),
        "body_id": result_body_id,
        "params": {**shell, **key_params, "engine": "browser_wasm"},
        "status": "ok",
    })
    await persist_new_body(
        db, storage, project_id, user_id,
        await browser_body_objects(project_id, result_body_id, step_bytes, mesh, naming),
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"body_id": result_body_id, "mesh": mesh, "hidden_body_ids": [body_id]}
