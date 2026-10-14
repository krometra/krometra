import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.services.geometry_ops.browser_transform import parse_rotate, parse_translate, save_browser_transform

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

    monkeypatch.setattr("app.services.geometry_ops.browser_transform.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


async def _save(document, translate=(2.4, 0.0, 0.0), rotate=None, copy=False, version=3):
    return await save_browser_transform(
        "project", "user", SOURCE, list(translate), rotate, copy, version,
        b"ISO-10303-21;", json.dumps(_browser_mesh()), None, _WritableStorage(),
        feature_key="k-0011223344556677",
    )


def test_browser_transform_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-transform"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/ExtrudeResponse")


@pytest.mark.asyncio
async def test_move_hides_source_and_records_transform(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)
    rotate = {"axis": [0.0, 0.0, 1.0], "angle": 90.0, "origin": [0.0, 0.0, 0.0]}

    result = await _save(document, rotate=rotate)

    assert result["hidden_body_ids"] == [SOURCE]
    assert document.components[SOURCE]["visible"] is False
    entry = document.timeline[-1]
    assert entry["kind"] == "transform"
    assert entry["label"] == "Перемещение 1"
    assert entry["body_id"] == result["body_id"]
    assert entry["params"] == {
        "target_body_id": SOURCE, "translate": [2.4, 0.0, 0.0], "rotate": rotate, "copy": False,
        "feature_key": "k-0011223344556677", "engine": "browser_wasm",
    }


@pytest.mark.asyncio
async def test_copy_keeps_source_visible(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    result = await _save(document, translate=(0.0, 0.0, 0.0), copy=True)

    assert result["hidden_body_ids"] == []
    assert document.components[SOURCE]["visible"] is True
    assert document.components[result["body_id"]]["source"]["copy"] is True


@pytest.mark.asyncio
async def test_move_without_change_is_rejected(monkeypatch):
    _patch_document(monkeypatch, _document())
    with pytest.raises(HTTPException) as error:
        await _save(_document(), translate=(0.0, 0.0, 0.0))
    assert error.value.detail["error"] == "invalid_transform_params"


@pytest.mark.asyncio
async def test_version_conflict_is_reported(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)
    with pytest.raises(HTTPException) as error:
        await _save(document, version=2)
    assert error.value.status_code == 409


def test_parsers_validate_vectors_and_rotation():
    assert parse_translate("[1, 2, 3]") == [1.0, 2.0, 3.0]
    assert parse_rotate(None) is None
    assert parse_rotate("null") is None
    with pytest.raises(HTTPException):
        parse_translate("[1, 2]")
    with pytest.raises(HTTPException):
        parse_rotate('{"axis": [0, 0, 0], "angle": 10, "origin": [0, 0, 0]}')
    with pytest.raises(HTTPException):
        parse_rotate('{"axis": [0, 0, 1], "angle": "x", "origin": [0, 0, 0]}')

