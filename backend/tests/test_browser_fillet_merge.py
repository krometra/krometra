import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_active_user, get_db, get_storage
from app.main import app
from app.services.geometry_ops.browser_fillet_merge import parse_entry_ids, save_browser_fillet_merge

MODULE = "app.services.geometry_ops.browser_fillet_merge"

pytestmark = pytest.mark.usefixtures("stub_quota")


def _mesh() -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {
            "faces": [{"face_id": "f-top", "edges": ["e-a"]}],
            "edges": [{"edge_id": "e-a", "vertices": [], "polyline": [0, 0, 0, 1, 0, 0]}],
        },
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


def _fillet(entry_id: str, target: str, output: str, edges: list[str], radius: float = 5.0) -> dict:
    return {
        "id": entry_id,
        "timestamp": "t",
        "kind": "fillet",
        "label": entry_id,
        "body_id": output,
        "params": {"target_body_id": target, "edge_ids": edges, "radius": radius, "feature_key": f"k-{entry_id}", "engine": "browser_wasm"},
        "status": "ok",
    }


def _body(kind: str, visible: bool) -> dict:
    return {"type": "body", "source": {"kind": kind}, "visible": visible}


def _document(timeline: list, **extra) -> SimpleNamespace:
    return SimpleNamespace(
        version=7,
        components={
            "body-0000000000c0": _body("browser_extrude", False),
            "body-000000000001": _body("browser_fillet", False),
            "body-000000000002": _body("browser_fillet", True),
            **extra,
        },
        timeline=[{"id": "e1", "kind": "extrude", "body_id": "body-0000000000c0", "params": {"engine": "browser_wasm"}}, *timeline],
    )


def _patch(monkeypatch, document):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        assert update.version == document.version
        document.components = update.components
        document.timeline = update.timeline
        document.version += 1
        return document

    monkeypatch.setattr(f"{MODULE}.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


async def _merge(document, storage=None, entry_ids=("f1", "f2"), radius=5.0, version=7):
    return await save_browser_fillet_merge(
        project_id="project", user_id="user", entry_ids=list(entry_ids), edge_names=["e-1", "e-2", "e-3"],
        radius=radius, document_version=version, step_bytes=b"ISO-10303-21;", mesh_json=json.dumps(_mesh()),
        db=None, storage=storage or _Storage(), naming=None, feature_key="k-f1",
    )


def _run() -> list:
    return [_fillet("f1", "body-0000000000c0", "body-000000000001", ["e-1", "e-2"]), _fillet("f2", "body-000000000001", "body-000000000002", ["e-3"])]


@pytest.mark.asyncio
async def test_merge_replaces_run_with_single_fillet_from_parent(monkeypatch):
    document = _document(_run())
    _patch(monkeypatch, document)

    result = await _merge(document)

    body_id = result["body_id"]
    assert result["hidden_body_ids"] == ["body-000000000001", "body-000000000002"]
    assert "body-000000000001" not in document.components and "body-000000000002" not in document.components
    assert document.components[body_id]["visible"] is True
    assert document.components[body_id]["source"]["target_body_id"] == "body-0000000000c0"
    assert [entry["id"] for entry in document.timeline] == ["e1", "f1"]
    merged = document.timeline[-1]
    assert merged["body_id"] == body_id
    assert merged["label"] == "f1"
    assert merged["params"] == {
        "target_body_id": "body-0000000000c0", "edge_ids": ["e-1", "e-2", "e-3"], "radius": 5.0,
        "feature_key": "k-f1", "engine": "browser_wasm",
    }


@pytest.mark.asyncio
async def test_merge_rejects_stale_document(monkeypatch):
    document = _document(_run())
    _patch(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _merge(document, version=6)

    assert error.value.status_code == 409
    assert error.value.detail["error"] == "version_conflict"


@pytest.mark.parametrize("timeline, entry_ids, radius", [
    (_run(), ("f1", "f2"), 3.0),
    (_run(), ("f2", "f1"), 5.0),
    (_run(), ("f1", "missing"), 5.0),
    ([_fillet("f1", "body-0000000000c0", "body-000000000001", ["e-1"]), _fillet("f2", "body-000000000001", "body-000000000002", ["e-3"], radius=2.0)], ("f1", "f2"), 5.0),
    ([*_run(), {"id": "x", "kind": "boolean", "target_body_id": "body-000000000002", "tool_body_id": "body-0000000000c0", "params": {}}], ("f1", "f2"), 5.0),
    ([*_run(), _fillet("f3", "body-000000000001", "body-000000000003", ["e-9"])], ("f1", "f2"), 5.0),
])
@pytest.mark.asyncio
async def test_merge_rejects_run_that_is_not_a_fillet_tail(monkeypatch, timeline, entry_ids, radius):
    document = _document(timeline)
    _patch(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _merge(document, entry_ids=entry_ids, radius=radius)

    assert error.value.status_code == 409


@pytest.mark.parametrize("value", ["nope", "[]", '["a", "a"]', '[1]', '{"a": 1}'])
def test_entry_ids_are_validated(value):
    with pytest.raises(HTTPException):
        parse_entry_ids(value)


@pytest.mark.asyncio
async def test_merge_endpoint_saves_single_fillet(monkeypatch):
    document = _document([_fillet("f1", "body-0000000000c0", "body-000000000001", ["e-1"])], **{"body-000000000001": _body("browser_fillet", True)})
    _patch(monkeypatch, document)
    storage = _Storage()

    async def fake_db():
        yield None

    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id="user")
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_storage] = lambda: storage
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/projects/project/geometry/browser-fillet-merge",
                data={
                    "mesh": json.dumps(_mesh()), "entry_ids": '["f1"]', "edge_ids": '["e-1", "e-2"]',
                    "radius": "5", "document_version": "7", "feature_key": "k-f1",
                },
                files={"step": ("f.step", b"ISO-10303-21;", "application/step")},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert response.json()["hidden_body_ids"] == ["body-000000000001"]
    assert [entry["kind"] for entry in document.timeline].count("fillet") == 1
    assert document.timeline[-1]["params"]["edge_ids"] == ["e-1", "e-2"]


@pytest.mark.asyncio
async def test_merge_moves_face_sketches_to_merged_body(monkeypatch):
    on_face = {"plane": "XY", "entities": [], "ref_body_id": "body-000000000001", "ref_face_id": "f-top"}
    on_parent = {"plane": "XY", "entities": [], "ref_body_id": "body-0000000000c0", "ref_face_id": "f-top"}
    document = _document(_run(), **{"sketch-1": on_face, "sketch-2": on_parent})
    _patch(monkeypatch, document)

    result = await _merge(document)

    assert document.components["sketch-1"]["ref_body_id"] == result["body_id"]
    assert document.components["sketch-1"]["ref_face_id"] == "f-top"
    assert document.components["sketch-2"]["ref_body_id"] == "body-0000000000c0"
