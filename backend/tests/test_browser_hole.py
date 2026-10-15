import dataclasses
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.services.geometry_ops.browser_hole import BrowserHoleParams, parse_hole_centers, save_browser_hole
from app.services.geometry_ops.browser_rebuild import validated_rebuild_params

pytestmark = pytest.mark.usefixtures("stub_quota")

SOURCE = "body-aaaaaaaaaaaa"


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


PARAMS = BrowserHoleParams(
    face_id="f-top", hole_type="counterbore", diameter=5.0, extent="distance", depth=10.0, bottom="cone",
    cbore_diameter=9.0, cbore_depth=4.0, csink_diameter=10.0, csink_angle=90.0,
    centers=((10.0, 10.0, 20.0), (30.0, 10.0, 20.0)),
)


def _document(kind="browser_extrude", visible=True, sketch=False):
    components = {SOURCE: {"type": "body", "source": {"kind": kind}, "visible": visible}}
    if sketch:
        components["sk-holes"] = {"type": "sketch", "plane": "XY", "plane_offset": 20, "entities": []}
    return SimpleNamespace(version=3, components=components, timeline=[])


def _patch_document(monkeypatch, document):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_hole.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


async def _save(document, params=PARAMS, version=3, storage=None, sketch_id=None):
    return await save_browser_hole(
        project_id="project",
        user_id="user",
        body_id=SOURCE,
        params=params,
        sketch_id=sketch_id,
        document_version=version,
        step_bytes=b"ISO-10303-21;",
        mesh_json=json.dumps(_browser_mesh()),
        db=None,
        storage=storage or _WritableStorage(),
        feature_key="k-hole",
    )


def test_browser_hole_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-hole"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/HoleResponse")


@pytest.mark.asyncio
async def test_browser_hole_stores_new_body_and_hides_source(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)
    storage = _WritableStorage()

    result = await _save(document, storage=storage)

    body_id = result["body_id"]
    assert body_id != SOURCE
    assert result["hole_count"] == 2
    assert document.components[SOURCE]["visible"] is False
    assert document.components[body_id]["source"] == {"kind": "browser_hole", "target_body_id": SOURCE, "face_id": "f-top"}
    assert f"project/geometry/{body_id}.step" in storage.objects
    entry = document.timeline[-1]
    assert entry["kind"] == "hole"
    assert entry["label"] == "Отверстие 1"
    assert entry["body_id"] == body_id
    assert "sketch_id" not in entry
    assert entry["params"] == {
        "feature_key": "k-hole", "face_id": "f-top", "hole_type": "counterbore", "diameter": 5.0, "extent": "distance",
        "depth": 10.0, "bottom": "cone", "cbore_diameter": 9.0, "cbore_depth": 4.0, "csink_diameter": 10.0,
        "csink_angle": 90.0, "centers": [[10.0, 10.0, 20.0], [30.0, 10.0, 20.0]], "target_body_id": SOURCE,
        "engine": "browser_wasm",
    }


@pytest.mark.asyncio
async def test_browser_hole_links_sketch_with_centers(monkeypatch):
    document = _document(sketch=True)
    _patch_document(monkeypatch, document)

    await _save(document, sketch_id="sk-holes")

    assert document.timeline[-1]["sketch_id"] == "sk-holes"


@pytest.mark.parametrize("sketch_id", ["sk-missing", "../evil", SOURCE])
@pytest.mark.asyncio
async def test_browser_hole_rejects_unknown_sketch(monkeypatch, sketch_id):
    document = _document(sketch=True)
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save(document, sketch_id=sketch_id)

    assert error.value.detail["error"] == "sketch_not_found"


@pytest.mark.parametrize("change", [
    {"diameter": 0.0},
    {"depth": float("nan")},
    {"hole_type": "tapped"},
    {"extent": "up_to_face"},
    {"bottom": "round"},
    {"csink_angle": 180.0},
    {"cbore_diameter": 5.0},
    {"hole_type": "countersink", "csink_diameter": 4.0},
    {"face_id": ""},
    {"centers": ()},
])
@pytest.mark.asyncio
async def test_browser_hole_rejects_invalid_params(monkeypatch, change):
    document = _document()
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save(document, dataclasses.replace(PARAMS, **change))

    assert error.value.detail["error"] in ("invalid_hole_params", "invalid_hole_centers")
    assert document.timeline == []


@pytest.mark.parametrize(("kind", "visible", "version", "status", "code"), [
    ("extrude", True, 3, 400, "target_not_browser"),
    ("browser_extrude", False, 3, 409, "target_changed"),
    ("browser_extrude", True, 2, 409, "version_conflict"),
])
@pytest.mark.asyncio
async def test_browser_hole_rejects_unusable_target(monkeypatch, kind, visible, version, status, code):
    document = _document(kind, visible)
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save(document, version=version)

    assert error.value.status_code == status
    assert error.value.detail["error"] == code


def test_parse_hole_centers_accepts_points():
    assert parse_hole_centers("[[1, 2, 3], [4.5, 5, 6]]") == [[1.0, 2.0, 3.0], [4.5, 5.0, 6.0]]


@pytest.mark.parametrize("raw", ["", "[]", "{}", "[[1, 2]]", "[[1, 2, true]]", '[[1, 2, "3"]]', json.dumps([[0, 0, 0]] * 101)])
def test_parse_hole_centers_rejects_malformed(raw):
    with pytest.raises(HTTPException) as error:
        parse_hole_centers(raw)

    assert error.value.detail["error"] == "invalid_hole_centers"


def test_hole_rebuild_params_accept_sizes_and_choices():
    params = {"diameter": 6, "hole_type": "countersink", "extent": "through_all", "bottom": "cone", "csink_angle": 82}

    assert validated_rebuild_params("hole", params) == {
        "diameter": 6.0, "hole_type": "countersink", "extent": "through_all", "bottom": "cone", "csink_angle": 82.0,
    }


@pytest.mark.parametrize("params", [
    {"diameter": 0},
    {"depth": -1},
    {"hole_type": "tapped"},
    {"extent": 1},
    {"csink_angle": 180},
    {"pitch": 1},
])
def test_hole_rebuild_params_are_validated(params):
    with pytest.raises(HTTPException) as error:
        validated_rebuild_params("hole", params)

    assert error.value.detail["error"] == "invalid_rebuild_params"
