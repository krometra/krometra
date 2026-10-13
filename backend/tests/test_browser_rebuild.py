import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_active_user, get_db, get_storage
from app.main import app
from app.services.geometry_ops.browser_rebuild import (
    RebuiltBody,
    affected_bodies,
    save_browser_rebuild,
    validated_rebuild_params,
)

pytestmark = pytest.mark.usefixtures("stub_quota")


def _mesh(size: float = 1.0) -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, size, 0.0, 0.0, 0.0, size, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {"faces": [{"face_id": "f-a", "edges": []}], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [size, size, 0.0]},
        "face_triangle_map": ["f-a"],
    }


NAMING = json.dumps({"version": 1, "faces": [{"name": "f-a", "fingerprint": [0, 0, 0, 1]}]})


class _Storage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    async def get_object(self, key: str) -> bytes | None:
        return self.objects.get(key)

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data


def _browser(**params):
    return {**params, "engine": "browser_wasm"}


def _document():
    body = lambda kind: {"type": "body", "source": {"kind": kind, "distance": 10}, "visible": True}  # noqa: E731
    return SimpleNamespace(
        version=7,
        components={"body-000000000001": body("browser_extrude"), "body-000000000002": body("browser_fillet"), "body-000000000003": body("browser_extrude"), "body-000000000004": body("browser_boolean")},
        timeline=[
            {"id": "e1", "kind": "extrude", "body_id": "body-000000000001", "params": _browser(distance=10, direction="one_side")},
            {"id": "e2", "kind": "extrude", "body_id": "body-000000000003", "params": _browser(distance=5)},
            {"id": "f1", "kind": "fillet", "body_id": "body-000000000002", "params": _browser(target_body_id="body-000000000001", radius=1, edge_ids=["e-a"])},
            {"id": "bo", "kind": "boolean", "result_body_id": "body-000000000004", "target_body_id": "body-000000000002", "tool_body_id": "body-000000000003", "params": _browser()},
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


def _bodies(*body_ids, size=2.0):
    return [RebuiltBody(body_id, b"ISO-10303-21;" + body_id.encode(), json.dumps(_mesh(size)), NAMING) for body_id in body_ids]


def test_empty_params_rebuild_after_sketch_edit():
    assert validated_rebuild_params("boolean", {}) == {}


def test_affected_bodies_follow_dependencies_only():
    document = _document()
    assert affected_bodies(document.timeline, 0, document.components) == {"body-000000000001", "body-000000000002", "body-000000000004"}
    assert affected_bodies(document.timeline, 1, document.components) == {"body-000000000003", "body-000000000004"}


def test_affected_bodies_reject_server_dependents():
    timeline = _document().timeline + [{"id": "s", "kind": "chamfer", "body_id": "body-000000000005", "params": {"target_body_id": "body-000000000004"}}]
    with pytest.raises(HTTPException) as error:
        affected_bodies(timeline, 0, {})
    assert error.value.detail["error"] == "rebuild_unsupported"


@pytest.mark.parametrize(("kind", "params"), [
    ("extrude", {"distance": 0}),
    ("extrude", {"direction": "sideways"}),
    ("extrude", {"operation": "cut"}),
    ("revolve", {"angle": 400}),
    ("fillet", {"radius": -1}),
    ("chamfer", {"distance1": True}),
    ("boolean", {"operation": "union"}),
    ("fillet", []),
])
def test_rebuild_params_are_whitelisted_and_validated(kind, params):
    with pytest.raises(HTTPException) as error:
        validated_rebuild_params(kind, params)
    assert error.value.detail["error"] == "invalid_rebuild_params"


@pytest.mark.asyncio
async def test_rebuild_replaces_affected_bodies_and_updates_params(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)

    result = await save_browser_rebuild("p", "u", "e1", {"distance": 25}, _bodies("body-000000000001", "body-000000000002", "body-000000000004"), {}, 7, None, storage)

    assert [body["body_id"] for body in result["bodies"]] == ["body-000000000001", "body-000000000002", "body-000000000004"]
    assert storage.objects["p/geometry/body-000000000002.step"] == b"ISO-10303-21;body-000000000002"
    assert "p/geometry/body-000000000004.naming.json" in storage.objects
    assert document.timeline[0]["params"]["distance"] == 25.0
    assert document.components["body-000000000001"]["source"]["distance"] == 25.0
    assert document.components["body-000000000004"]["bbox"]["max"] == [2.0, 2.0, 0.0]
    assert document.version == 8


@pytest.mark.parametrize(("body_ids", "version", "code"), [
    (("body-000000000001", "body-000000000002"), 7, "rebuild_bodies_mismatch"),
    (("body-000000000001", "body-000000000002", "body-000000000004", "body-000000000003"), 7, "rebuild_bodies_mismatch"),
    (("body-000000000001", "body-000000000002", "body-000000000004"), 6, "version_conflict"),
])
@pytest.mark.asyncio
async def test_rebuild_rejects_inconsistent_requests(monkeypatch, body_ids, version, code):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await save_browser_rebuild("p", "u", "e1", {"distance": 25}, _bodies(*body_ids), {}, version, None, storage)

    assert error.value.detail["error"] == code
    assert storage.objects == {}


@pytest.mark.asyncio
async def test_rebuild_route_accepts_multipart_bodies(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)

    async def fake_db():
        yield None

    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id="u")
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_storage] = lambda: storage
    try:
        data = {"entry_id": "e2", "params": json.dumps({"distance": 9}), "document_version": "7", "bodies": json.dumps(["body-000000000003", "body-000000000004"])}
        files = {}
        for body_id in ("body-000000000003", "body-000000000004"):
            data[f"mesh:{body_id}"] = json.dumps(_mesh())
            data[f"naming:{body_id}"] = NAMING
            files[f"step:{body_id}"] = (f"{body_id}.step", b"ISO-10303-21;", "application/step")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/projects/p/geometry/browser-rebuild", data=data, files=files)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert [body["body_id"] for body in response.json()["bodies"]] == ["body-000000000003", "body-000000000004"]
    assert document.timeline[1]["params"]["distance"] == 9.0
