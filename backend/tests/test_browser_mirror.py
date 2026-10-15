import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.services.geometry_ops.browser_mirror import check_mirror_rebuild, mirror_plane_params, save_browser_mirror
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


def _document():
    return SimpleNamespace(
        version=3,
        components={SOURCE: {"type": "body", "source": {"kind": "browser_extrude"}, "visible": True}},
        timeline=[],
    )


def _patch_document(monkeypatch, document):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_mirror.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


async def _save(document, plane=None, merge=False, version=3, body_id=SOURCE):
    return await save_browser_mirror(
        "project", "user", body_id, plane or mirror_plane_params("YZ", 0.0, None), merge, version,
        b"ISO-10303-21;", json.dumps(_browser_mesh()), None, _WritableStorage(),
        feature_key="k-0011223344556677",
    )


def _error_code(call) -> str:
    with pytest.raises(HTTPException) as error:
        call()
    return error.value.detail["error"]


def test_browser_mirror_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-mirror"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/ExtrudeResponse")


@pytest.mark.asyncio
async def test_copy_keeps_source_visible_and_records_mirror(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    result = await _save(document, plane=mirror_plane_params("XY", 5.0, None))

    assert result["hidden_body_ids"] == []
    assert document.components[SOURCE]["visible"] is True
    assert document.components[result["body_id"]]["source"]["kind"] == "browser_mirror"
    entry = document.timeline[-1]
    assert entry["kind"] == "mirror"
    assert entry["label"] == "Зеркало 1"
    assert entry["body_id"] == result["body_id"]
    assert entry["params"] == {
        "target_body_id": SOURCE, "plane": "XY", "offset": 5.0, "face_id": None, "merge": False,
        "feature_key": "k-0011223344556677", "engine": "browser_wasm",
    }


@pytest.mark.asyncio
async def test_merge_hides_source(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    result = await _save(document, plane=mirror_plane_params(None, 0.0, "f-cap"), merge=True)

    assert result["hidden_body_ids"] == [SOURCE]
    assert document.components[SOURCE]["visible"] is False
    assert document.timeline[-1]["params"]["face_id"] == "f-cap"
    assert document.timeline[-1]["params"]["plane"] is None


@pytest.mark.asyncio
async def test_version_conflict_and_hidden_source_are_rejected(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)
    with pytest.raises(HTTPException) as error:
        await _save(document, version=2)
    assert error.value.status_code == 409

    document.components[SOURCE]["visible"] = False
    with pytest.raises(HTTPException) as error:
        await _save(document)
    assert error.value.detail["error"] == "target_changed"


def test_plane_params_require_exactly_one_plane():
    assert mirror_plane_params("XZ", -2, None) == {"plane": "XZ", "offset": -2.0, "face_id": None}
    assert mirror_plane_params(None, 7, "f-x") == {"plane": None, "offset": 0.0, "face_id": "f-x"}
    assert _error_code(lambda: mirror_plane_params(None, 0, None)) == "invalid_mirror_params"
    assert _error_code(lambda: mirror_plane_params("XY", 0, "f-x")) == "invalid_mirror_params"
    assert _error_code(lambda: mirror_plane_params("ZX", 0, None)) == "invalid_mirror_params"
    assert _error_code(lambda: mirror_plane_params("XY", float("inf"), None)) == "invalid_mirror_params"
    assert _error_code(lambda: mirror_plane_params(None, 0, "face-1")) == "invalid_mirror_params"


def test_rebuild_edits_base_plane_but_not_face_mirror():
    assert validated_rebuild_params("mirror", {"plane": "YZ", "offset": -3}) == {"plane": "YZ", "offset": -3.0}
    assert _error_code(lambda: validated_rebuild_params("mirror", {"plane": "ZX"})) == "invalid_rebuild_params"
    assert _error_code(lambda: validated_rebuild_params("mirror", {"merge": True})) == "invalid_rebuild_params"
    check_mirror_rebuild({"kind": "mirror", "params": {"face_id": None}}, {"plane": "XZ"})
    check_mirror_rebuild({"kind": "mirror", "params": {"face_id": "f-x"}}, {})
    face_entry = {"kind": "mirror", "params": {"face_id": "f-x"}}
    assert _error_code(lambda: check_mirror_rebuild(face_entry, {"offset": 1.0})) == "invalid_mirror_params"
