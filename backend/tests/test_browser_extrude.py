import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.geometry import MeshResponse
from app.services.geometry_ops.browser_boolean import save_browser_boolean
from app.services.geometry_ops.browser_extrude import _validated_browser_mesh, parse_revolve_origin, save_browser_extrude

pytestmark = pytest.mark.usefixtures("stub_quota")


def _browser_mesh() -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {"faces": [{"face_id": 1, "edges": []}], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 0.0]},
        "face_triangle_map": [1],
    }


def test_browser_mesh_matches_persisted_mesh_contract():
    mesh = MeshResponse(**_browser_mesh())

    assert mesh.vertices[3] == 1.0
    assert mesh.brep_topo.faces[0].face_id == 1


def test_browser_mesh_rejects_missing_topology():
    mesh = _browser_mesh()
    del mesh["brep_topo"]

    with pytest.raises(ValidationError):
        MeshResponse(**mesh)


@pytest.mark.parametrize("change", [
    lambda mesh: mesh.update(indices=[0, 1, 3]),
    lambda mesh: mesh.update(face_triangle_map=[]),
    lambda mesh: mesh.update(vertices=[]),
])
def test_browser_mesh_rejects_inconsistent_geometry(change):
    mesh = _browser_mesh()
    change(mesh)

    with pytest.raises(HTTPException) as error:
        _validated_browser_mesh(json.dumps(mesh))

    assert error.value.detail["error"] == "invalid_browser_mesh"


@pytest.mark.parametrize("change", [
    lambda mesh: mesh["bbox"].update(max=[2.0, 1.0, 0.0]),
    lambda mesh: mesh["brep_topo"].update(faces=[
        {"face_id": 1, "edges": []}, {"face_id": 1, "edges": []},
    ]),
])
def test_browser_mesh_rejects_untrustworthy_metadata(change):
    mesh = _browser_mesh()
    change(mesh)

    with pytest.raises(HTTPException) as error:
        _validated_browser_mesh(json.dumps(mesh))

    assert error.value.detail["error"] == "invalid_browser_mesh"


@pytest.mark.parametrize("value", [
    '{"x": 10, "y": -2.5}',
    '{"x": 0.0, "y": 0}',
])
def test_parse_revolve_origin_accepts_finite_xy_coordinates(value):
    assert parse_revolve_origin(value) == json.loads(value)


@pytest.mark.parametrize("value", [
    "[]", '{"x": 0}', '{"x": 0, "y": 0, "z": 0}', '{"x": "0", "y": 0}', '{"x": NaN, "y": 0}',
])
def test_parse_revolve_origin_rejects_invalid_coordinates(value):
    with pytest.raises(HTTPException) as error:
        parse_revolve_origin(value)

    assert error.value.detail["error"] == "invalid_revolve_params"


class _WritableStorage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data


@pytest.mark.asyncio
async def test_browser_extrude_accepts_saved_sketch_data_without_component_type(monkeypatch):
    document = SimpleNamespace(
        version=3,
        components={"sketch-1": {"plane": "XY", "entities": [], "constraints": []}},
        timeline=[],
    )
    storage = _WritableStorage()

    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_extrude.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)

    result = await save_browser_extrude(
        project_id="project",
        user_id="user",
        sketch_id="sketch-1",
        distance=10,
        direction="one_side",
        document_version=3,
        step_bytes=b"ISO-10303-21;",
        mesh_json=json.dumps(_browser_mesh()),
        db=None,
        storage=storage,
    )

    assert result["body_id"] in document.components
    assert len(storage.objects) == 2


def _patch_document(monkeypatch, document, module="browser_extrude"):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr(f"app.services.geometry_ops.{module}.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


def _document_with_bodies(**bodies):
    return SimpleNamespace(
        version=3,
        components={
            "sketch-1": {"plane": "XY", "entities": [], "constraints": []},
            **{
                body_id: {"type": "body", "source": {"kind": kind}, "visible": True}
                for body_id, kind in bodies.items()
            },
        },
        timeline=[],
    )


async def _save_join(document, target_body_id):
    return await save_browser_extrude(
        project_id="project",
        user_id="user",
        sketch_id="sketch-1",
        distance=5,
        direction="one_side",
        document_version=3,
        step_bytes=b"ISO-10303-21;",
        mesh_json=json.dumps(_browser_mesh()),
        db=None,
        storage=_WritableStorage(),
        operation="join",
        target_body_id=target_body_id,
    )


@pytest.mark.asyncio
async def test_browser_join_hides_target_and_records_lineage(monkeypatch):
    document = _document_with_bodies(**{"body-aaaaaaaaaaaa": "browser_extrude"})
    _patch_document(monkeypatch, document)

    result = await _save_join(document, "body-aaaaaaaaaaaa")

    assert result["hidden_body_ids"] == ["body-aaaaaaaaaaaa"]
    assert document.components["body-aaaaaaaaaaaa"]["visible"] is False
    source = document.components[result["body_id"]]["source"]
    assert source["operation"] == "join"
    assert source["target_body_id"] == "body-aaaaaaaaaaaa"
    assert document.timeline[-1]["params"]["target_body_id"] == "body-aaaaaaaaaaaa"


@pytest.mark.asyncio
async def test_browser_join_rejects_server_target(monkeypatch):
    document = _document_with_bodies(**{"body-aaaaaaaaaaaa": "extrude"})
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save_join(document, "body-aaaaaaaaaaaa")

    assert error.value.detail["error"] == "target_not_browser"


@pytest.mark.asyncio
async def test_browser_join_rejects_consumed_target(monkeypatch):
    document = _document_with_bodies(**{"body-aaaaaaaaaaaa": "browser_extrude"})
    _patch_document(monkeypatch, document)
    await _save_join(document, "body-aaaaaaaaaaaa")
    document.version = 3

    with pytest.raises(HTTPException) as error:
        await _save_join(document, "body-aaaaaaaaaaaa")

    assert error.value.status_code == 409
    assert error.value.detail["error"] == "target_changed"


async def _save_boolean(document, operation="subtract", tool_body_id="body-bbbbbbbbbbbb"):
    return await save_browser_boolean(
        project_id="project",
        user_id="user",
        operation=operation,
        target_body_id="body-aaaaaaaaaaaa",
        tool_body_id=tool_body_id,
        document_version=3,
        step_bytes=b"ISO-10303-21;",
        mesh_json=json.dumps(_browser_mesh()),
        db=None,
        storage=_WritableStorage(),
    )


@pytest.mark.asyncio
async def test_browser_boolean_hides_both_inputs(monkeypatch):
    document = _document_with_bodies(**{"body-aaaaaaaaaaaa": "browser_extrude", "body-bbbbbbbbbbbb": "browser_revolve"})
    _patch_document(monkeypatch, document, "browser_boolean")

    result = await _save_boolean(document)

    result_body = document.components[result["result_body_id"]]
    assert result_body["source"] == {
        "kind": "browser_boolean", "operation": "subtract", "target_body_id": "body-aaaaaaaaaaaa", "tool_body_id": "body-bbbbbbbbbbbb",
    }
    assert document.components["body-aaaaaaaaaaaa"]["visible"] is False
    assert document.components["body-bbbbbbbbbbbb"]["visible"] is False
    assert document.timeline[-1]["kind"] == "boolean"


@pytest.mark.parametrize(("operation", "tool_body_id", "kind", "code"), [
    ("xor", "body-bbbbbbbbbbbb", "browser_extrude", "invalid_boolean_params"),
    ("union", "body-aaaaaaaaaaaa", "browser_extrude", "invalid_boolean_params"),
    ("union", "body-bbbbbbbbbbbb", "extrude", "target_not_browser"),
])
@pytest.mark.asyncio
async def test_browser_boolean_rejects_invalid_inputs(monkeypatch, operation, tool_body_id, kind, code):
    document = _document_with_bodies(**{"body-aaaaaaaaaaaa": "browser_extrude", "body-bbbbbbbbbbbb": kind})
    _patch_document(monkeypatch, document, "browser_boolean")

    with pytest.raises(HTTPException) as error:
        await _save_boolean(document, operation, tool_body_id)

    assert error.value.detail["error"] == code
