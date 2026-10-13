import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_active_user, get_db, get_storage
from app.main import app
from app.services.geometry_ops.browser_edge_feature import parse_edge_names, save_browser_edge_feature
from app.services.geometry_ops.browser_extrude import save_browser_extrude
from app.services.geometry_ops.browser_naming import (
    load_browser_naming,
    validated_browser_naming,
    validated_feature_key,
)

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


def _naming() -> dict:
    return {"version": 1, "faces": [{"name": "f-top", "fingerprint": [0.3, 0.3, 0.0, 0.5]}]}


class _Storage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    async def get_object(self, key: str) -> bytes | None:
        return self.objects.get(key)

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data


def _document(**bodies):
    return SimpleNamespace(
        version=3,
        components={
            "sketch-1": {"plane": "XY", "entities": [], "constraints": []},
            **{body_id: {"type": "body", "source": {"kind": kind}, "visible": True} for body_id, kind in bodies.items()},
        },
        timeline=[],
    )


def _patch(monkeypatch, document, *modules):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        document.version += 1
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)
    for module in modules:
        monkeypatch.setattr(f"app.services.geometry_ops.{module}.get_document", get_document)


def test_naming_accepts_versioned_face_table():
    assert validated_browser_naming(json.dumps(_naming())) == _naming()
    assert validated_browser_naming(None) is None


@pytest.mark.parametrize("naming", [
    "not json",
    json.dumps({"version": 2, "faces": []}),
    json.dumps({"version": 1, "faces": [{"name": "f", "fingerprint": [0, 0, 0]}]}),
    json.dumps({"version": 1, "faces": [{"name": "", "fingerprint": [0, 0, 0, 1]}]}),
    json.dumps({"version": 1, "faces": [{"name": "f", "fingerprint": [0, 0, 0, True]}]}),
    json.dumps({"version": 1, "faces": [{"name": "f", "fingerprint": [0, 0, 0, 1]}] * 2}),
])
def test_naming_rejects_malformed_table(naming):
    with pytest.raises(HTTPException) as error:
        validated_browser_naming(naming)

    assert error.value.detail["error"] == "invalid_browser_naming"


@pytest.mark.parametrize(("key", "valid"), [("k-1a2b", True), ("tl_abc", True), ("../etc", False), ("", False)])
def test_feature_key_format(key, valid):
    if valid:
        assert validated_feature_key(key) == key
    else:
        with pytest.raises(HTTPException):
            validated_feature_key(key)


@pytest.mark.asyncio
async def test_extrude_stores_naming_and_feature_key(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document, "browser_extrude", "browser_naming")

    result = await save_browser_extrude(
        project_id="project", user_id="user", sketch_id="sketch-1", distance=10, direction="one_side",
        document_version=3, step_bytes=b"ISO-10303-21;", mesh_json=json.dumps(_mesh()), db=None, storage=storage,
        naming=_naming(), feature_key="k-1",
    )

    body_id = result["body_id"]
    assert json.loads(storage.objects[f"project/geometry/{body_id}.naming.json"]) == _naming()
    assert document.timeline[-1]["params"]["feature_key"] == "k-1"
    assert document.components[body_id]["source"]["feature_key"] == "k-1"
    assert await load_browser_naming("project", body_id, "user", None, storage) == storage.objects[
        f"project/geometry/{body_id}.naming.json"
    ]


@pytest.mark.asyncio
async def test_missing_naming_is_not_found(monkeypatch):
    document = _document(**{"body-aaaaaaaaaaaa": "browser_extrude", "body-cccccccccccc": "extrude"})
    _patch(monkeypatch, document, "browser_naming")

    for body_id in ("body-aaaaaaaaaaaa", "body-cccccccccccc"):
        with pytest.raises(HTTPException) as error:
            await load_browser_naming("project", body_id, "user", None, _Storage())
        assert error.value.status_code == 404


def test_edge_names_must_be_unique_strings():
    assert parse_edge_names('["e-a", "e-b"]') == ["e-a", "e-b"]
    for value in ("[]", '["e-a", "e-a"]', "[1]", "{}", "nope"):
        with pytest.raises(HTTPException):
            parse_edge_names(value)


async def _save_edge_feature(document, storage, kind="fillet", params=None, body_id="body-aaaaaaaaaaaa"):
    return await save_browser_edge_feature(
        project_id="project", user_id="user", kind=kind, body_id=body_id, edge_names=["e-a"],
        params=params or {"radius": 2}, document_version=3, step_bytes=b"ISO-10303-21;",
        mesh_json=json.dumps(_mesh()), db=None, storage=storage, naming=_naming(), feature_key="k-f",
    )


@pytest.mark.asyncio
async def test_fillet_creates_result_body_and_hides_source(monkeypatch):
    document = _document(**{"body-aaaaaaaaaaaa": "browser_extrude"})
    storage = _Storage()
    _patch(monkeypatch, document, "browser_edge_feature")

    result = await _save_edge_feature(document, storage)

    body_id = result["body_id"]
    assert result["hidden_body_ids"] == ["body-aaaaaaaaaaaa"]
    assert document.components["body-aaaaaaaaaaaa"]["visible"] is False
    assert document.components[body_id]["source"] == {
        "kind": "browser_fillet", "target_body_id": "body-aaaaaaaaaaaa", "edge_ids": ["e-a"], "radius": 2.0, "feature_key": "k-f",
    }
    entry = document.timeline[-1]
    assert entry["kind"] == "fillet" and entry["body_id"] == body_id
    assert entry["params"] == {
        "target_body_id": "body-aaaaaaaaaaaa", "edge_ids": ["e-a"], "radius": 2.0, "feature_key": "k-f", "engine": "browser_wasm",
    }
    assert f"project/geometry/{body_id}.naming.json" in storage.objects


@pytest.mark.asyncio
async def test_chamfer_records_both_distances(monkeypatch):
    document = _document(**{"body-aaaaaaaaaaaa": "browser_revolve"})
    _patch(monkeypatch, document, "browser_edge_feature")

    result = await _save_edge_feature(document, _Storage(), "chamfer", {"distance1": 1, "distance2": 3})

    assert document.components[result["body_id"]]["source"]["distance2"] == 3.0
    assert document.timeline[-1]["kind"] == "chamfer"
    assert document.timeline[-1]["params"]["distance1"] == 1.0


@pytest.mark.parametrize(("kind", "params", "body_kind", "version", "code"), [
    ("fillet", {"radius": 0}, "browser_extrude", 3, "invalid_edge_feature"),
    ("fillet", {"radius": float("nan")}, "browser_extrude", 3, "invalid_edge_feature"),
    ("thread", {"radius": 1}, "browser_extrude", 3, "invalid_edge_feature"),
    ("chamfer", {"distance1": 1}, "browser_extrude", 3, "invalid_edge_feature"),
    ("fillet", {"radius": 1}, "extrude", 3, "target_not_browser"),
    ("fillet", {"radius": 1}, "browser_extrude", 2, "version_conflict"),
])
@pytest.mark.asyncio
async def test_edge_feature_rejects_invalid_requests(monkeypatch, kind, params, body_kind, version, code):
    document = _document(**{"body-aaaaaaaaaaaa": body_kind})
    document.version = version
    _patch(monkeypatch, document, "browser_edge_feature")

    with pytest.raises(HTTPException) as error:
        await _save_edge_feature(document, _Storage(), kind, params)

    assert error.value.detail["error"] == code


@pytest.mark.asyncio
async def test_edge_feature_rejects_consumed_body(monkeypatch):
    document = _document(**{"body-aaaaaaaaaaaa": "browser_extrude"})
    document.components["body-aaaaaaaaaaaa"]["visible"] = False
    _patch(monkeypatch, document, "browser_edge_feature")

    with pytest.raises(HTTPException) as error:
        await _save_edge_feature(document, _Storage())

    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_fillet_and_naming_routes_round_trip(monkeypatch):
    document = _document(**{"body-aaaaaaaaaaaa": "browser_extrude"})
    storage = _Storage()
    _patch(monkeypatch, document, "browser_edge_feature", "browser_naming")

    async def fake_db():
        yield None

    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id="user")
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_storage] = lambda: storage
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/projects/project/geometry/browser-fillet",
                data={
                    "mesh": json.dumps(_mesh()), "body_id": "body-aaaaaaaaaaaa", "edge_ids": '["e-a"]', "radius": "1.5",
                    "document_version": "3", "naming": json.dumps(_naming()), "feature_key": "k-f",
                },
                files={"step": ("f.step", b"ISO-10303-21;", "application/step")},
            )
            body_id = created.json()["body_id"]
            naming = await client.get(f"/api/projects/project/geometry/{body_id}/browser-naming")
    finally:
        app.dependency_overrides.clear()

    assert created.status_code == 200, created.text
    assert created.json()["hidden_body_ids"] == ["body-aaaaaaaaaaaa"]
    assert naming.status_code == 200
    assert naming.json() == _naming()
