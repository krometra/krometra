import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.document import DocumentUpdate
from app.schemas.sketch import SketchData, sketch_component
from app.services.geometry_ops.browser_rebuild import RebuiltBody, affected_bodies, save_browser_rebuild
from app.services.geometry_ops.browser_sketch_seat import reassign_sketch_owner, seated_sketches, sketch_owner

pytestmark = pytest.mark.usefixtures("stub_quota")

BOX = "body-000000000001"
BOSS = "body-000000000002"
OTHER = "body-000000000003"
NAMING = json.dumps({"version": 1, "faces": [{"name": "f-top", "fingerprint": [0, 0, 0, 1]}]})


def _plane(height: float) -> dict:
    return {
        "plane": "XY",
        "plane_offset": height,
        "plane_basis": {"origin": [0, 0, height], "u": [1, 0, 0], "v": [0, 1, 0], "n": [0, 0, 1]},
    }


def _work_plane(owner: str | None = BOX, height: float = 15.0) -> dict:
    definition = {"kind": "offset", "reference": {"kind": "face", "bodyId": BOX, "faceName": "f-top"}, "distance": 5}
    return {"type": "work_plane", "label": "Плоскость 1", "definition": definition, "ref_body_id": owner, **_plane(height)}


def _mesh() -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {"faces": [{"face_id": "f-top", "edges": []}], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 0.0]},
        "face_triangle_map": ["f-top"],
    }


class _Storage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    async def get_object(self, key: str) -> bytes | None:
        return self.objects.get(key)

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data


def _browser(**params):
    return {**params, "engine": "browser_wasm"}


def _document(owner: str | None = BOX):
    body = {"type": "body", "source": {"kind": "browser_extrude", "distance": 10}, "visible": True}
    return SimpleNamespace(
        version=7,
        components={
            BOX: dict(body),
            BOSS: dict(body),
            OTHER: dict(body),
            "sketch-base": {"plane": "XY", "plane_offset": 0.0, "entities": []},
            "plane-1": _work_plane(owner),
            "sketch-wp": {**_plane(15.0), "entities": [{"id": "c"}], "ref_plane_id": "plane-1"},
        },
        timeline=[
            {"id": "sk1", "kind": "sketch", "sketch_id": "sketch-base", "plane": "XY"},
            {"id": "e1", "kind": "extrude", "sketch_id": "sketch-base", "body_id": BOX, "params": _browser(distance=10)},
            {"id": "sk2", "kind": "sketch", "sketch_id": "sketch-wp", "plane": "XY"},
            {"id": "e2", "kind": "extrude", "sketch_id": "sketch-wp", "body_id": BOSS, "params": _browser(distance=5, operation="new_body")},
        ],
    )


def _patch(monkeypatch, document):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        document.version += 1
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_rebuild.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


def _bodies(*body_ids):
    return [RebuiltBody(body_id, b"ISO-10303-21;", json.dumps(_mesh()), NAMING) for body_id in body_ids]


async def _rebuild(document, sketch_planes, bodies=(BOX, BOSS), failed=None):
    return await save_browser_rebuild("p", "u", "e1", {"distance": 30}, _bodies(*bodies), sketch_planes, 7, None, _Storage(), failed)


def test_document_accepts_work_plane_and_sketch_on_it():
    update = DocumentUpdate(components={"plane-1": _work_plane(), "sketch-wp": {"entities": [], "ref_plane_id": "plane-1"}}, version=1)
    assert update.components["plane-1"]["type"] == "work_plane"


@pytest.mark.parametrize("broken", [
    {"definition": None},
    {"definition": {"kind": "spiral"}},
    {"plane": "AB"},
    {"plane_offset": float("nan")},
    {"plane_basis": {"origin": [0, 0], "u": [1, 0, 0], "v": [0, 1, 0], "n": [0, 0, 1]}},
    {"plane_basis": None},
    {"ref_body_id": "../etc"},
])
def test_document_rejects_malformed_work_plane(broken):
    with pytest.raises(ValidationError):
        DocumentUpdate(components={"plane-1": {**_work_plane(), **broken}}, version=1)


def test_document_rejects_bad_plane_reference():
    with pytest.raises(ValidationError):
        DocumentUpdate(components={"sketch-wp": {"entities": [], "ref_plane_id": "../plane"}}, version=1)


def test_sketch_save_keeps_plane_reference():
    data = SketchData(plane="XY", plane_offset=15, ref_plane_id="plane-1", entities=[])
    assert sketch_component(data, None)["ref_plane_id"] == "plane-1"
    assert SketchData().ref_plane_id is None
    with pytest.raises(ValidationError):
        SketchData(ref_plane_id="плоскость")


def test_work_plane_and_its_sketch_follow_the_owner_body():
    components = _document().components
    assert sketch_owner(components, "plane-1") == BOX
    assert sketch_owner(components, "sketch-wp") == BOX
    assert seated_sketches(components, {BOX}) == {"plane-1", "sketch-wp"}
    assert affected_bodies(_document().timeline, 1, components) == {BOX, BOSS}


def test_work_plane_without_owner_stays_out_of_rebuild():
    document = _document(owner=None)
    assert sketch_owner(document.components, "sketch-wp") is None
    assert seated_sketches(document.components, {BOX}) == set()
    assert affected_bodies(document.timeline, 1, document.components) == {BOX}


def test_reassign_moves_the_plane_not_its_sketch():
    components = _document().components
    reassign_sketch_owner(components, {BOX}, OTHER)
    assert components["plane-1"]["ref_body_id"] == OTHER
    assert "ref_body_id" not in components["sketch-wp"]


@pytest.mark.asyncio
async def test_rebuild_stores_moved_work_plane_and_sketch(monkeypatch):
    document = _document()
    _patch(monkeypatch, document)

    await _rebuild(document, {"plane-1": _plane(35), "sketch-wp": _plane(35)})

    assert document.components["plane-1"]["plane_offset"] == 35.0
    assert document.components["plane-1"]["definition"]["distance"] == 5
    assert document.components["sketch-wp"]["plane_basis"]["origin"] == [0.0, 0.0, 35.0]
    assert document.components["sketch-wp"]["ref_plane_id"] == "plane-1"


@pytest.mark.asyncio
async def test_rebuild_requires_the_work_plane_too(monkeypatch):
    document = _document()
    _patch(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _rebuild(document, {"sketch-wp": _plane(35)})

    assert error.value.detail["error"] == "rebuild_sketches_mismatch"


@pytest.mark.asyncio
async def test_rebuild_accepts_failed_work_plane(monkeypatch):
    document = _document()
    _patch(monkeypatch, document)

    failed = {"plane-1": "«Плоскость 1»: нет грани", "sk2": "«Плоскость 1»: нет грани", "e2": "«Плоскость 1»: нет грани"}
    await _rebuild(document, {}, bodies=(BOX,), failed=failed)

    assert document.components["plane-1"]["plane_offset"] == 15.0
    assert next(entry for entry in document.timeline if entry["id"] == "e2")["status"] == "error"
