"""Таблица стабильных имён граней browser-тела: сервер проверяет только формат."""

import json
import math

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.ids import is_body_id, is_component_id
from app.services.document_service import get_document

from .browser_extrude import _error, is_browser_body
from .common import browser_naming_key
from .limits import MAX_MESH_FACES, MAX_NAMING_BYTES

MAX_NAME_LENGTH = 200


def _is_fingerprint(value: object) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 4
        and all(isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item) for item in value)
    )


def _is_named_face(value: object) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("name"), str)
        and 0 < len(value["name"]) <= MAX_NAME_LENGTH
        and _is_fingerprint(value.get("fingerprint"))
    )


def validated_browser_naming(naming_json: str | None) -> dict | None:
    if naming_json is None:
        return None
    if len(naming_json.encode("utf-8")) > MAX_NAMING_BYTES:
        _error("browser_naming_too_large", "Таблица имён browser-тела превышает 2 МБ.", 413)
    try:
        naming = json.loads(naming_json)
    except json.JSONDecodeError:
        _error("invalid_browser_naming", "Некорректная таблица имён browser-тела.")
    if not isinstance(naming, dict) or naming.get("version") != 1:
        _error("invalid_browser_naming", "Неизвестная версия таблицы имён browser-тела.")
    faces = naming.get("faces")
    if not isinstance(faces, list) or len(faces) > MAX_MESH_FACES or not all(_is_named_face(face) for face in faces):
        _error("invalid_browser_naming", "Таблица имён должна содержать имена и отпечатки граней.")
    names = [face["name"] for face in faces]
    if len(names) != len(set(names)):
        _error("invalid_browser_naming", "Имена граней browser-тела должны быть уникальны.")
    return {"version": 1, "faces": faces}


def validated_feature_key(feature_key: str | None) -> str | None:
    if feature_key is None:
        return None
    if not is_component_id(feature_key):
        _error("invalid_feature_key", "Ключ операции должен состоять из латиницы, цифр, '-' или '_'.")
    return feature_key


async def load_browser_naming(
    project_id: str,
    body_id: str,
    user_id: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
) -> bytes:
    doc = await get_document(db, project_id, user_id)
    if not is_body_id(body_id) or not is_browser_body((doc.components or {}).get(body_id)):
        _error("browser_naming_not_found", "Таблица имён browser-тела не найдена.", status.HTTP_404_NOT_FOUND)
    naming = await storage.get_object(browser_naming_key(project_id, body_id))
    if not naming:
        _error("browser_naming_not_found", "Таблица имён browser-тела не найдена.", status.HTTP_404_NOT_FOUND)
    return naming
