import asyncio
import datetime as dt
import uuid
from dataclasses import dataclass

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.services.document_service import get_document

from .browser_extrude import _error, validated_browser_upload
from .browser_naming import validated_browser_naming
from .browser_storage import browser_body_objects, persist_new_body
from .common import new_body_id, next_label
from .limits import MAX_IMPORT_BODIES, MAX_IMPORT_FILE_NAME

DEFAULT_FILE_NAME = "import.step"


@dataclass(frozen=True)
class ImportedBody:
    step: bytes
    mesh_json: str
    naming_json: str


def import_file_name(value: str) -> str:
    base = value.replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(char for char in base if char.isprintable()).strip()
    return name[:MAX_IMPORT_FILE_NAME] or DEFAULT_FILE_NAME


def checked_import_count(count: int) -> None:
    if count == 0:
        _error("import_no_bodies", "В STEP-файле нет тел для импорта.")
    if count > MAX_IMPORT_BODIES:
        _error(
            "too_many_import_bodies",
            f"За один импорт можно загрузить не больше {MAX_IMPORT_BODIES} тел.",
            status.HTTP_413_CONTENT_TOO_LARGE,
        )


def paired_import_bodies(steps: list[bytes], meshes: list[str], namings: list[str]) -> list[ImportedBody]:
    if not len(steps) == len(meshes) == len(namings):
        _error("import_bodies_mismatch", "Для каждого импортированного тела нужны STEP, меш и таблица имён.")
    return [ImportedBody(step, mesh, naming) for step, mesh, naming in zip(steps, meshes, namings)]


def _validated_uploads(bodies: list[ImportedBody]) -> list[tuple[ImportedBody, dict, dict]]:
    return [
        (body, validated_browser_upload(body.step, body.mesh_json), validated_browser_naming(body.naming_json))
        for body in bodies
    ]


async def save_browser_import(
    project_id: str,
    user_id: str,
    file_name: str,
    bodies: list[ImportedBody],
    document_version: int,
    db: AsyncSession,
    storage: AsyncStorageClient,
) -> dict:
    checked_import_count(len(bodies))
    uploads = await asyncio.to_thread(_validated_uploads, bodies)
    name = import_file_name(file_name)

    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время импорта в браузере.", status.HTTP_409_CONFLICT)
    components = dict(doc.components or {})
    timeline = list(doc.timeline or [])
    objects = []
    imported = []
    for index, (body, mesh, naming) in enumerate(uploads):
        body_id = new_body_id()
        placement = {"file_name": name, "body_index": index, "body_count": len(uploads)}
        components[body_id] = {
            "type": "body",
            "source": {"kind": "browser_import", **placement},
            "visible": True,
            "bbox": mesh["bbox"],
        }
        timeline.append({
            "id": f"tl-{uuid.uuid4().hex[:12]}",
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "kind": "import",
            "label": next_label(timeline, "import"),
            "body_id": body_id,
            "params": {**placement, "engine": "browser_wasm"},
            "status": "ok",
        })
        objects += await browser_body_objects(project_id, body_id, body.step, mesh, naming)
        imported.append({"body_id": body_id, "mesh": mesh})
    await persist_new_body(
        db, storage, project_id, user_id, objects,
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"bodies": imported}
