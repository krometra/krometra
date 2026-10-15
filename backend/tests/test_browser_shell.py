import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.services.geometry_ops.browser_rebuild import validated_rebuild_params
from app.services.geometry_ops.browser_shell import parse_face_names, save_browser_shell, validated_shell_params

pytestmark = pytest.mark.usefixtures("stub_quota")

SOURCE = "body-aaaaaaaaaaaa"
FACES = ["f-top", "f-side"]


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


def _document(visible=True):
    return SimpleNamespace(
        version=3,
        components={SOURCE: {"type": "body", "source": {"kind": "browser_extrude"}, "visible": visible}},
        timeline=[],
    )


def _patch_document(monkeypatch, document):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_shell.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


async def _save(document, thickness=2.0, direction="inward", version=3, storage=None):
    return await save_browser_shell(
        "project", "user", SOURCE, FACES, {"thickness": thickness, "direction": direction}, version,
        b"ISO-10303-21;", json.dumps(_browser_mesh()), None, storage or _WritableStorage(),
        feature_key="k-0011223344556677",
    )


def test_browser_shell_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-shell"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/ExtrudeResponse")


@pytest.mark.asyncio
async def test_shell_hides_source_and_records_feature(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)
    storage = _WritableStorage()

    result = await _save(document, thickness=1.5, direction="outward", storage=storage)

    assert result["hidden_body_ids"] == [SOURCE]
    assert document.components[SOURCE]["visible"] is False
    assert document.components[result["body_id"]]["source"]["kind"] == "browser_shell"
    entry = document.timeline[-1]
    assert entry["kind"] == "shell"
    assert entry["label"] == "Оболочка 1"
    assert entry["body_id"] == result["body_id"]
    assert entry["params"] == {
        "target_body_id": SOURCE, "face_ids": FACES, "thickness": 1.5, "direction": "outward",
        "feature_key": "k-0011223344556677", "engine": "browser_wasm",
    }
    assert f"project/geometry/{result['body_id']}.step" in storage.objects


@pytest.mark.asyncio
async def test_hidden_source_is_rejected(monkeypatch):
    document = _document(visible=False)
    _patch_document(monkeypatch, document)
    with pytest.raises(HTTPException) as error:
        await _save(document)
    assert error.value.detail["error"] == "target_changed"
    assert document.timeline == []


@pytest.mark.asyncio
async def test_version_conflict_is_reported(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)
    with pytest.raises(HTTPException) as error:
        await _save(document, version=2)
    assert error.value.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("thickness, direction", [(0, "inward"), (-1, "inward"), (float("nan"), "inward"), (2, "both")])
async def test_invalid_params_are_rejected_before_saving(monkeypatch, thickness, direction):
    document = _document()
    _patch_document(monkeypatch, document)
    with pytest.raises(HTTPException) as error:
        await _save(document, thickness=thickness, direction=direction)
    assert error.value.detail["error"] == "invalid_shell_params"
    assert document.timeline == []


def test_shell_params_are_normalized():
    assert validated_shell_params(2, "inward") == {"thickness": 2.0, "direction": "inward"}
    with pytest.raises(HTTPException):
        validated_shell_params(True, "inward")


@pytest.mark.parametrize("value", ["", "[]", '"f-top"', '["f-top", "f-top"]', '[1]', "[" + ",".join(['"f"'] * 2) + "]"])
def test_face_names_are_validated(value):
    with pytest.raises(HTTPException) as error:
        parse_face_names(value)
    assert error.value.detail["error"] == "invalid_face_ids"


def test_face_names_are_parsed():
    assert parse_face_names('["f-top", "f-side~1"]') == ["f-top", "f-side~1"]


def test_rebuild_accepts_thickness_and_direction():
    assert validated_rebuild_params("shell", {"thickness": 3, "direction": "outward"}) == {"thickness": 3.0, "direction": "outward"}
    for params in ({"thickness": 0}, {"direction": "one_side"}, {"face_ids": ["f-a"]}):
        with pytest.raises(HTTPException) as error:
            validated_rebuild_params("shell", params)
        assert error.value.detail["error"] == "invalid_rebuild_params"
