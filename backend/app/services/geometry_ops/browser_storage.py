"""Файлы browser-тела в хранилище: пишутся вместе с документом и откатываются при его ошибке."""

import asyncio
import json
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.services.document_service import save_document
from app.services.storage_quota import ensure_storage_quota, refresh_project_usage

from .common import browser_naming_key, browser_step_key, mesh_key


@dataclass(frozen=True)
class StoredObject:
    key: str
    data: bytes
    content_type: str


def _json_bytes(value: object) -> bytes:
    return json.dumps(value).encode("utf-8")


async def browser_body_objects(
    project_id: str, body_id: str, step_bytes: bytes, mesh: dict, naming: dict | None
) -> list[StoredObject]:
    objects = [
        StoredObject(mesh_key(project_id, body_id), await asyncio.to_thread(_json_bytes, mesh), "application/json"),
        StoredObject(browser_step_key(project_id, body_id), step_bytes, "application/step"),
    ]
    if naming is not None:
        objects.append(StoredObject(browser_naming_key(project_id, body_id), _json_bytes(naming), "application/json"))
    return objects


async def _restore(storage: AsyncStorageClient, objects: list[StoredObject], previous: dict[str, bytes | None]) -> None:
    for obj in objects:
        old = previous[obj.key]
        if old is None:
            await storage.delete_object(obj.key)
        else:
            await storage.put_object(obj.key, old, obj.content_type)


async def _save_with_objects(
    db: AsyncSession,
    storage: AsyncStorageClient,
    project_id: str,
    user_id: str,
    objects: list[StoredObject],
    previous: dict[str, bytes | None],
    update: DocumentUpdate,
) -> None:
    added = sum(len(obj.data) for obj in objects) - sum(len(old) for old in previous.values() if old)
    await ensure_storage_quota(db, user_id, added)
    try:
        for obj in objects:
            await storage.put_object(obj.key, obj.data, obj.content_type)
        await save_document(db, project_id, user_id, update)
    except Exception:
        await _restore(storage, objects, previous)
        raise
    await refresh_project_usage(db, storage, project_id)


async def persist_new_body(
    db: AsyncSession,
    storage: AsyncStorageClient,
    project_id: str,
    user_id: str,
    objects: list[StoredObject],
    update: DocumentUpdate,
) -> None:
    await _save_with_objects(db, storage, project_id, user_id, objects, {obj.key: None for obj in objects}, update)


async def persist_replaced_bodies(
    db: AsyncSession,
    storage: AsyncStorageClient,
    project_id: str,
    user_id: str,
    objects: list[StoredObject],
    update: DocumentUpdate,
) -> None:
    previous = {obj.key: await storage.get_object(obj.key) for obj in objects}
    await _save_with_objects(db, storage, project_id, user_id, objects, previous, update)
