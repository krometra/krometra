import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.services.geometry_ops.browser_rebuild import affected_bodies, validated_rebuild_params
from app.services.geometry_ops.browser_sketch_seat import feature_sketch_owner
from app.services.geometry_ops.browser_sweep import BrowserSweepParams, save_browser_sweep
from app.services.geometry_ops.target_resolution import resolve_target_body

pytestmark = pytest.mark.usefixtures("stub_quota")

TARGET = "body-aaaaaaaaaaaa"


class _WritableStorage:
    def __init__(self):
        self.objects = {}

    async def put_object(self, key, data, content_type):
        self.objects[key] = data


def _browser_mesh() -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {"faces": [{"face_id": 1, "edges": []}], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 0.0]},
        "face_triangle_map": [1],
    }


def _sketch(plane="XY"):
    return {"plane": plane, "entities": [], "constraints": []}


def _document():
    return SimpleNamespace(
        version=3,
        components={
            "s-profile": _sketch(),
            "s-path": _sketch("XZ"),
            TARGET: {"type": "body", "source": {"kind": "browser_extrude"}, "visible": True},
        },
        timeline=[],
    )


def _patch_document(monkeypatch, document):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_sweep.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


def _params(**patch):
    values = {"sketch_id": "s-profile", "path_sketch_id": "s-path", "orientation": "corrected", "operation": "new_body", "target_body_id": None}
    return BrowserSweepParams(**{**values, **patch})


async def _save(document, version=3, **patch):
    return await save_browser_sweep(
        "project", "user", _params(**patch), version, b"ISO-10303-21;", json.dumps(_browser_mesh()), None, _WritableStorage(),
        feature_key="k-0011223344556677",
    )


def test_browser_sweep_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-sweep"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/ExtrudeResponse")


@pytest.mark.asyncio
async def test_sweep_records_both_sketches_in_history(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    result = await _save(document)

    entry = document.timeline[-1]
    assert entry["kind"] == "sweep"
    assert entry["label"] == "По траектории 1"
    assert entry["sketch_id"] == "s-profile"
    assert entry["body_id"] == result["body_id"]
    assert entry["params"] == {
        "path_sketch_id": "s-path", "orientation": "corrected", "operation": "new_body",
        "feature_key": "k-0011223344556677", "engine": "browser_wasm",
    }
    source = document.components[result["body_id"]]["source"]
    assert source["kind"] == "browser_sweep"
    assert source["path_sketch_id"] == "s-path"
    assert result["hidden_body_ids"] == []


@pytest.mark.asyncio
async def test_sweep_cut_consumes_target(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    result = await _save(document, operation="cut", target_body_id=TARGET)

    assert result["hidden_body_ids"] == [TARGET]
    assert document.components[TARGET]["visible"] is False
    assert document.timeline[-1]["params"]["target_body_id"] == TARGET
    assert resolve_target_body(document.components, TARGET) == result["body_id"]


@pytest.mark.parametrize(("patch", "code"), [
    ({"path_sketch_id": "s-profile"}, "invalid_sweep_params"),
    ({"orientation": "twisted"}, "invalid_sweep_params"),
    ({"path_sketch_id": "../evil"}, "invalid_sketch_id"),
    ({"path_sketch_id": "s-missing"}, "sketch_not_found"),
    ({"operation": "cut"}, "target_required"),
    ({"operation": "xor"}, "invalid_extrude_params"),
])
@pytest.mark.asyncio
async def test_sweep_rejects_invalid_requests(monkeypatch, patch, code):
    document = _document()
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save(document, **patch)

    assert error.value.detail["error"] == code
    assert document.timeline == []


@pytest.mark.asyncio
async def test_sweep_rejects_stale_document(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save(document, version=2)

    assert error.value.status_code == 409


def test_sweep_orientation_is_editable_after_the_fact():
    assert validated_rebuild_params("sweep", {"orientation": "frenet"}) == {"orientation": "frenet"}
    with pytest.raises(HTTPException) as error:
        validated_rebuild_params("sweep", {"orientation": "spiral"})
    assert error.value.detail["error"] == "invalid_rebuild_params"


def test_sweep_depends_on_profile_sketch_owner_and_target():
    components = {
        "s-face": {"plane": "XY", "entities": [], "ref_body_id": "body-000000000001", "ref_face_id": "f-top"},
        "body-000000000001": {"type": "body", "source": {"kind": "browser_extrude"}},
    }
    sweep = {"id": "sw", "kind": "sweep", "sketch_id": "s-face", "body_id": "body-000000000002", "params": {"engine": "browser_wasm"}}
    timeline = [
        {"id": "e1", "kind": "extrude", "body_id": "body-000000000001", "params": {"engine": "browser_wasm"}},
        sweep,
    ]

    assert feature_sketch_owner(components, sweep) == "body-000000000001"
    assert affected_bodies(timeline, 0, components) == {"body-000000000001", "body-000000000002"}
