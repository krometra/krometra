import dataclasses
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.services.geometry_ops.browser_thread import BrowserThreadParams, save_browser_thread

pytestmark = pytest.mark.usefixtures("stub_quota")


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


PARAMS = BrowserThreadParams(
    face_id="1154355835", pitch=1.5, depth=0.92, length=15.0, offset=2.0,
    crest_ratio=0.0, starts=1, right_handed=True, external=True, diameter=10.0,
)


def _document(kind="browser_extrude", visible=True):
    return SimpleNamespace(
        version=3,
        components={"body-aaaaaaaaaaaa": {"type": "body", "source": {"kind": kind}, "visible": visible}},
        timeline=[],
    )


def _patch_document(monkeypatch, document):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_thread.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


async def _save(document, params=PARAMS, version=3, storage=None):
    return await save_browser_thread(
        project_id="project",
        user_id="user",
        body_id="body-aaaaaaaaaaaa",
        params=params,
        document_version=version,
        step_bytes=b"ISO-10303-21;",
        mesh_json=json.dumps(_browser_mesh()),
        db=None,
        storage=storage or _WritableStorage(),
    )


def test_browser_thread_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-thread"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/ThreadResponse")


@pytest.mark.asyncio
async def test_browser_thread_stores_new_body_and_hides_source(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)
    storage = _WritableStorage()

    result = await _save(document, storage=storage)

    body_id = result["body_id"]
    assert body_id != "body-aaaaaaaaaaaa"
    assert document.components["body-aaaaaaaaaaaa"]["visible"] is False
    assert document.components[body_id]["source"] == {
        "kind": "browser_thread", "target_body_id": "body-aaaaaaaaaaaa", "face_id": "1154355835",
    }
    assert f"project/geometry/{body_id}.step" in storage.objects
    entry = document.timeline[-1]
    assert entry["kind"] == "thread"
    assert entry["body_id"] == body_id
    assert entry["params"]["kind"] == "external"
    assert entry["params"]["engine"] == "browser_wasm"
    assert entry["params"]["target_body_id"] == "body-aaaaaaaaaaaa"
    assert result["diameter"] == 10.0
    assert result["starts"] == 1


@pytest.mark.parametrize(("change", "code"), [
    ({"pitch": 0.0}, "invalid_thread_params"),
    ({"depth": float("nan")}, "invalid_thread_params"),
    ({"offset": -1.0}, "invalid_thread_params"),
    ({"crest_ratio": 1.0}, "invalid_thread_params"),
    ({"starts": 0}, "invalid_thread_params"),
    ({"face_id": ""}, "invalid_thread_params"),
])
@pytest.mark.asyncio
async def test_browser_thread_rejects_invalid_params(monkeypatch, change, code):
    document = _document()
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save(document, dataclasses.replace(PARAMS, **change))

    assert error.value.detail["error"] == code


@pytest.mark.parametrize(("kind", "visible", "version", "status", "code"), [
    ("extrude", True, 3, 400, "target_not_browser"),
    ("browser_extrude", False, 3, 409, "target_changed"),
    ("browser_extrude", True, 2, 409, "version_conflict"),
])
@pytest.mark.asyncio
async def test_browser_thread_rejects_unusable_target(monkeypatch, kind, visible, version, status, code):
    document = _document(kind, visible)
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save(document, version=version)

    assert error.value.status_code == status
    assert error.value.detail["error"] == code
