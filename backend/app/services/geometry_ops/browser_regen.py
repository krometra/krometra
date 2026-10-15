import asyncio

from fastapi import status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.schemas.ids import is_body_id, is_component_id
from app.services.document_service import get_document

from .browser_extrude import _error, is_browser_body
from .browser_rebuild import RebuiltBody, _validated_uploads, output_bodies, regen_chain, validated_rebuild_body_ids
from .browser_sketch_seat import apply_sketch_planes, seated_sketches, validated_partial_sketch_planes
from .browser_storage import browser_body_objects, persist_replaced_bodies
from .timeline_state import is_failed, is_suppressed


def _invalid(description: str):
    _error("invalid_regen_document", description)


def validated_regen_document(document: object, version: int) -> DocumentUpdate:
    if not isinstance(document, dict) or not isinstance(document.get("components"), dict) or not isinstance(document.get("timeline"), list):
        _invalid("Правка истории должна содержать components и timeline.")
    try:
        return DocumentUpdate(components=document["components"], timeline=document["timeline"], version=version)
    except ValidationError as error:
        _invalid(f"Некорректный документ после правки истории: {error.errors()[0].get('msg', '')}")


def validated_seeds(seeds: object) -> tuple[set[str], set[str]]:
    if not isinstance(seeds, dict):
        _invalid("Некорректные корни пересборки.")
    roots, bodies = seeds.get("roots", []), seeds.get("bodies", [])
    if not isinstance(roots, list) or not all(is_component_id(root) for root in roots):
        _invalid("Некорректные корни пересборки.")
    if not isinstance(bodies, list) or not all(is_body_id(body) for body in bodies):
        _invalid("Некорректные тела-корни пересборки.")
    return set(roots), set(bodies)


def expected_regen_bodies(chain: list[dict]) -> set[str]:
    return {body_id for entry in chain if not is_suppressed(entry) and not is_failed(entry) for body_id in output_bodies(entry)}


async def save_browser_regen(
    project_id: str,
    user_id: str,
    document: object,
    seeds: object,
    bodies: list[RebuiltBody],
    sketch_planes: dict,
    document_version: int,
    db: AsyncSession,
    storage: AsyncStorageClient,
) -> dict:
    validated_rebuild_body_ids([body.body_id for body in bodies])
    roots, seed_bodies = validated_seeds(seeds)
    update = validated_regen_document(document, document_version)
    uploads = await asyncio.to_thread(_validated_uploads, bodies)
    doc = await get_document(db, project_id, user_id)
    if doc.version != document_version:
        _error("version_conflict", "Документ изменился во время пересборки в браузере.", status.HTTP_409_CONFLICT)
    components = dict(update.components)
    timeline = [dict(entry) for entry in update.timeline]
    chain = regen_chain(timeline, components, roots, seed_bodies)
    uploaded = {body.body_id for body in bodies}
    if len(uploaded) != len(bodies) or uploaded != expected_regen_bodies(chain):
        _error("rebuild_bodies_mismatch", "Пересобранные тела не совпадают с зависимыми операциями.", status.HTTP_409_CONFLICT)
    if not all(is_browser_body(components.get(body_id)) for body_id in uploaded):
        _error("target_not_browser", "Браузерное ядро может изменять только browser-тела.")
    seated = seated_sketches(components, {body_id for entry in chain for body_id in output_bodies(entry)} | seed_bodies)
    planes = validated_partial_sketch_planes(sketch_planes, seated)

    objects = []
    for body, mesh, naming in uploads:
        objects += await browser_body_objects(project_id, body.body_id, body.step, mesh, naming)
        components[body.body_id] = {**components[body.body_id], "bbox": mesh["bbox"]}
    apply_sketch_planes(components, timeline, planes)
    await persist_replaced_bodies(
        db, storage, project_id, user_id, objects,
        DocumentUpdate(components=components, timeline=timeline, version=doc.version),
    )
    return {"bodies": [{"body_id": body.body_id, "mesh": mesh} for body, mesh, _naming in uploads]}
