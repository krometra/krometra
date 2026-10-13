import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_active_user, get_db, get_storage
from app.main import app
from app.services.geometry_ops.browser_rebuild import RebuiltBody, affected_bodies, save_browser_rebuild
from app.services.geometry_ops.browser_sketch_seat import reassign_sketch_owner, seated_sketches, sketch_owner

pytestmark = pytest.mark.usefixtures("stub_quota")

BOX = "body-000000000001"
BOSS = "body-000000000002"
OTHER = "body-000000000003"
NAMING = json.dumps({"version": 1, "faces": [{"name": "f-top", "fingerprint": [0, 0, 0, 1]}]})


def _mesh() -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {"faces": [{"face_id": "f-top", "edges": []}], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 0.0]},
        "face_triangle_map": ["f-top"],
    }


def _plane(height: float) -> dict:
    return {
        "plane": "XY",
        "plane_offset": height,
        "plane_basis": {"origin": [0, 0, height], "u": [1, 0, 0], "v": [0, 1, 0], "n": [0, 0, 1]},
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


def _document(face_ref="f-top"):
    body = {"type": "body", "source": {"kind": "browser_extrude", "distance": 10}, "visible": True}
    return SimpleNamespace(
        version=7,
        components={
            BOX: dict(body),
            BOSS: dict(body),
            OTHER: dict(body),
            "sketch-base": {"plane": "XY", "plane_offset": 0.0, "entities": [], "ref_body_id": None, "ref_face_id": None},
            "sketch-top": {**_plane(10.0), "entities": [{"id": "c"}], "ref_body_id": BOX, "ref_face_id": face_ref},
        },
        timeline=[
            {"id": "sk1", "kind": "sketch", "sketch_id": "sketch-base", "plane": "XY"},
            {"id": "e1", "kind": "extrude", "sketch_id": "sketch-base", "body_id": BOX, "params": _browser(distance=10)},
            {"id": "sk2", "kind": "sketch", "sketch_id": "sketch-top", "plane": "XY"},
            {"id": "e2", "kind": "extrude", "sketch_id": "sketch-top", "body_id": BOSS, "params": _browser(distance=5, operation="new_body")},
            {"id": "e3", "kind": "extrude", "sketch_id": "sketch-base", "body_id": OTHER, "params": _browser(distance=3)},
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


async def _rebuild(document, sketch_planes, bodies=(BOX, BOSS)):
    return await save_browser_rebuild("p", "u", "e1", {"distance": 30}, _bodies(*bodies), sketch_planes, 7, None, _Storage())


@pytest.mark.parametrize(("sketch", "owner"), [
    ({"entities": [], "ref_body_id": BOX, "ref_face_id": "f-top"}, BOX),
    ({"entities": [], "ref_body_id": BOX, "ref_face_id": "f-top~1"}, BOX),
    ({"entities": [], "ref_body_id": BOX, "ref_face_id": 4}, None),
    ({"entities": [], "ref_body_id": BOX, "ref_face_id": "4"}, None),
    ({"entities": [], "ref_body_id": BOX, "ref_face_id": "f-"}, None),
    ({"entities": [], "ref_body_id": None, "ref_face_id": "f-top"}, None),
    ({"entities": [], "ref_body_id": "", "ref_face_id": "f-top"}, None),
    ({"type": "body", "ref_body_id": BOX, "ref_face_id": "f-top"}, None),
])
def test_sketch_owner_requires_stable_face_name(sketch, owner):
    assert sketch_owner({"s": sketch}, "s") == owner


def test_sketch_owner_ignores_unknown_sketch():
    assert sketch_owner({}, "missing") is None
    assert sketch_owner({}, None) is None


def test_feature_on_face_sketch_follows_owner_body():
    document = _document()
    assert affected_bodies(document.timeline, 1, document.components) == {BOX, BOSS}
    assert seated_sketches(document.components, {BOX, BOSS}) == {"sketch-top"}


def test_legacy_face_sketch_does_not_follow_owner_body():
    document = _document(face_ref=4)
    assert affected_bodies(document.timeline, 1, document.components) == {BOX}
    assert seated_sketches(document.components, {BOX}) == set()


def test_reassign_sketch_owner_moves_only_sketches_of_superseded_bodies():
    components = _document().components
    reassign_sketch_owner(components, {BOX, None}, OTHER)
    assert "ref_body_id" not in components[BOSS]
    assert components["sketch-top"]["ref_body_id"] == OTHER
    assert components["sketch-top"]["ref_face_id"] == "f-top"
    assert components["sketch-base"]["ref_body_id"] is None


@pytest.mark.asyncio
async def test_rebuild_stores_reseated_sketch_plane(monkeypatch):
    document = _document()
    _patch(monkeypatch, document)

    await _rebuild(document, {"sketch-top": _plane(30)})

    sketch = document.components["sketch-top"]
    assert sketch["plane_offset"] == 30.0
    assert sketch["plane_basis"]["origin"] == [0.0, 0.0, 30.0]
    assert sketch["ref_face_id"] == "f-top" and sketch["entities"] == [{"id": "c"}]
    assert document.components["sketch-base"]["plane_offset"] == 0.0
    assert document.timeline[1]["params"]["distance"] == 30.0


@pytest.mark.asyncio
async def test_rebuild_updates_sketch_entry_plane(monkeypatch):
    document = _document()
    _patch(monkeypatch, document)

    await _rebuild(document, {"sketch-top": {**_plane(30), "plane": "YZ"}})

    assert document.timeline[2]["plane"] == "YZ"
    assert document.timeline[0]["plane"] == "XY"


@pytest.mark.parametrize("sketch_planes", [
    {},
    {"sketch-top": _plane(30), "sketch-base": _plane(0)},
    {"sketch-base": _plane(0)},
])
@pytest.mark.asyncio
async def test_rebuild_requires_planes_for_exactly_the_seated_sketches(monkeypatch, sketch_planes):
    document = _document()
    _patch(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _rebuild(document, sketch_planes)

    assert error.value.status_code == 409
    assert error.value.detail["error"] == "rebuild_sketches_mismatch"
    assert document.version == 7


@pytest.mark.parametrize("plane", [
    None,
    {**_plane(30), "plane": "AB"},
    {**_plane(30), "plane_offset": float("nan")},
    {**_plane(30), "plane_offset": "30"},
    {**_plane(30), "plane_basis": None},
    {**_plane(30), "plane_basis": {"origin": [0, 0], "u": [1, 0, 0], "v": [0, 1, 0], "n": [0, 0, 1]}},
    {**_plane(30), "plane_basis": {"origin": [0, 0, float("inf")], "u": [1, 0, 0], "v": [0, 1, 0], "n": [0, 0, 1]}},
    {**_plane(30), "plane_basis": {"origin": [0, 0, 30], "u": [1, 0, 0], "v": [0, 1, 0]}},
])
@pytest.mark.asyncio
async def test_rebuild_rejects_malformed_sketch_plane(monkeypatch, plane):
    document = _document()
    _patch(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _rebuild(document, {"sketch-top": plane})

    assert error.value.status_code == 400
    assert error.value.detail["error"] == "invalid_sketch_plane"
    assert document.components["sketch-top"]["plane_offset"] == 10.0


@pytest.mark.asyncio
async def test_rebuild_of_legacy_face_sketch_needs_no_planes(monkeypatch):
    document = _document(face_ref=4)
    _patch(monkeypatch, document)

    await _rebuild(document, {}, bodies=(BOX,))

    assert document.components["sketch-top"]["plane_offset"] == 10.0


@pytest.mark.asyncio
async def test_rebuild_route_accepts_sketch_planes(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)

    async def fake_db():
        yield None

    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id="u")
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_storage] = lambda: storage
    try:
        data = {
            "entry_id": "e1", "params": json.dumps({"distance": 30}), "document_version": "7",
            "bodies": json.dumps([BOX, BOSS]), "sketch_planes": json.dumps({"sketch-top": _plane(30)}),
        }
        files = {}
        for body_id in (BOX, BOSS):
            data[f"mesh:{body_id}"] = json.dumps(_mesh())
            data[f"naming:{body_id}"] = NAMING
            files[f"step:{body_id}"] = (f"{body_id}.step", b"ISO-10303-21;", "application/step")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/projects/p/geometry/browser-rebuild", data=data, files=files)
            data.pop("sketch_planes")
            stale_client = await client.post("/api/projects/p/geometry/browser-rebuild", data={**data, "document_version": "8"}, files=files)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert document.components["sketch-top"]["plane_offset"] == 30.0
    assert stale_client.status_code == 409
    assert stale_client.json()["detail"]["error"] == "rebuild_sketches_mismatch"
