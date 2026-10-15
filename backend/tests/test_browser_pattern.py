import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.services.geometry_ops.browser_import import ImportedBody
from app.services.geometry_ops.browser_pattern import save_browser_pattern
from app.services.geometry_ops.browser_pattern_params import (
    checked_pattern_edit,
    parse_pattern_params,
    pattern_reference_bodies,
    validated_pattern,
)
from app.services.geometry_ops.browser_rebuild import RebuiltBody, affected_bodies, input_bodies, save_browser_rebuild

pytestmark = pytest.mark.usefixtures("stub_quota")

SOURCE = "body-aaaaaaaaaaaa"
HUB = "body-bbbbbbbbbbbb"
NAMING = json.dumps({"version": 1, "faces": [{"name": "f-a", "fingerprint": [0, 0, 0, 1]}]})


class _WritableStorage:
    def __init__(self):
        self.objects = {}

    async def get_object(self, key):
        return self.objects.get(key)

    async def put_object(self, key, data, content_type):
        self.objects[key] = data


def _mesh() -> str:
    return json.dumps({
        "vertices": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {"faces": [{"face_id": "f-a", "edges": []}], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 0.0]},
        "face_triangle_map": ["f-a"],
    })


def _document():
    body = {"type": "body", "source": {"kind": "browser_extrude"}, "visible": True}
    return SimpleNamespace(version=3, components={SOURCE: dict(body), HUB: dict(body)}, timeline=[])


def _patch_document(monkeypatch, document):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_pattern.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


def _linear(**patch):
    return {"pattern_type": "linear", "mode": "join", "axis": {"kind": "x"}, "count": 3, "spacing": 20, "count2": 1, **patch}


def _circular(**patch):
    axis = {"kind": "face", "body_id": HUB, "name": "f-axis"}
    return {"pattern_type": "circular", "mode": "separate", "axis": axis, "count": 4, "angle": 360, **patch}


def _bodies(count: int) -> list[ImportedBody]:
    return [ImportedBody(b"ISO-10303-21;", _mesh(), NAMING) for _ in range(count)]


async def _save(document, params: dict, bodies: int, version=3):
    return await save_browser_pattern(
        "project", "user", SOURCE, validated_pattern(params), _bodies(bodies), version, None, _WritableStorage(),
        feature_key="k-0011223344556677",
    )


def test_browser_pattern_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-pattern"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/PatternResponse")


@pytest.mark.asyncio
async def test_joined_pattern_hides_source_and_records_one_body(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    result = await _save(document, _linear(), bodies=1)

    assert result["hidden_body_ids"] == [SOURCE]
    assert document.components[SOURCE]["visible"] is False
    entry = document.timeline[-1]
    assert entry["kind"] == "pattern"
    assert entry["label"] == "Массив 1"
    assert entry["body_id"] == result["bodies"][0]["body_id"]
    assert "body_ids" not in entry
    assert entry["params"] == {
        "target_body_id": SOURCE, "pattern_type": "linear", "mode": "join", "axis": {"kind": "x"}, "count": 3,
        "spacing": 20.0, "axis2": None, "count2": 1, "spacing2": 10.0,
        "feature_key": "k-0011223344556677", "engine": "browser_wasm",
    }


@pytest.mark.asyncio
async def test_separate_pattern_keeps_source_and_records_every_copy(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    result = await _save(document, _circular(), bodies=3)

    body_ids = [body["body_id"] for body in result["bodies"]]
    assert len(set(body_ids)) == 3
    assert result["hidden_body_ids"] == []
    assert document.components[SOURCE]["visible"] is True
    entry = document.timeline[-1]
    assert entry["body_id"] == body_ids[0]
    assert entry["body_ids"] == body_ids
    assert [document.components[body_id]["source"]["instance"] for body_id in body_ids] == [1, 2, 3]


@pytest.mark.asyncio
async def test_body_count_must_match_pattern(monkeypatch):
    _patch_document(monkeypatch, _document())
    with pytest.raises(HTTPException) as error:
        await _save(_document(), _circular(), bodies=2)
    assert error.value.detail["error"] == "pattern_bodies_mismatch"


@pytest.mark.asyncio
async def test_missing_axis_body_and_version_conflict(monkeypatch):
    document = _document()
    del document.components[HUB]
    _patch_document(monkeypatch, document)
    with pytest.raises(HTTPException) as error:
        await _save(document, _circular(), bodies=3)
    assert error.value.detail["error"] == "pattern_axis_missing"
    with pytest.raises(HTTPException) as conflict:
        await _save(_document(), _linear(), bodies=1, version=2)
    assert conflict.value.status_code == 409


@pytest.mark.parametrize("params", [
    _linear(count=1),
    _linear(count=2.5),
    _linear(spacing=0),
    _linear(count2=2),
    _linear(count2=2, axis2={"kind": "y"}, spacing2=0),
    _linear(axis={"kind": "custom", "origin": [0, 0, 0], "direction": [0, 0, 0]}),
    _linear(axis={"kind": "edge", "body_id": "../etc", "name": "e-1"}),
    _linear(mode="merge"),
    _circular(angle=0),
    _circular(angle=400),
    _circular(count=26),
    _linear(count=101),
])
def test_invalid_pattern_params_are_rejected(params):
    with pytest.raises(HTTPException) as error:
        validated_pattern(params)
    assert error.value.detail["error"] == "invalid_pattern_params"


def test_parse_and_reference_bodies():
    grid = parse_pattern_params(json.dumps(_linear(
        axis={"kind": "edge", "body_id": SOURCE, "name": "e-1"}, count2=2, axis2={"kind": "face", "body_id": HUB, "name": "f-1"}, spacing2=5,
    )))
    assert grid["count2"] == 2
    assert pattern_reference_bodies(grid) == [SOURCE, HUB]
    assert pattern_reference_bodies({**grid, "count2": 1}) == [SOURCE]
    assert pattern_reference_bodies(validated_pattern(_circular())) == [HUB]
    with pytest.raises(HTTPException):
        parse_pattern_params("not json")


def test_pattern_edit_keeps_body_set_of_separate_pattern():
    joined = validated_pattern(_linear())
    assert checked_pattern_edit(joined, {"count": 5.0, "spacing": -4.0}) == {"count": 5, "spacing": -4.0}
    separate = validated_pattern(_circular())
    assert checked_pattern_edit(separate, {"angle": 90.0}) == {"angle": 90.0}
    with pytest.raises(HTTPException) as locked:
        checked_pattern_edit(separate, {"count": 5.0})
    assert locked.value.detail["error"] == "pattern_count_locked"
    with pytest.raises(HTTPException):
        checked_pattern_edit(joined, {"count": 2.5})


def test_rebuild_sees_pattern_inputs_and_every_output():
    pattern = {
        "id": "pa", "kind": "pattern", "body_id": "body-000000000011", "body_ids": ["body-000000000011", "body-000000000012"],
        "params": {**validated_pattern(_circular()), "target_body_id": SOURCE, "engine": "browser_wasm"},
    }
    cut = {
        "id": "bo", "kind": "boolean", "result_body_id": "body-000000000013", "target_body_id": HUB,
        "tool_body_id": "body-000000000012", "params": {"engine": "browser_wasm"},
    }
    hub = {"id": "e1", "kind": "extrude", "body_id": HUB, "params": {"engine": "browser_wasm"}}
    assert input_bodies(pattern) == {SOURCE, HUB}
    assert affected_bodies([hub, pattern, cut], 0, {}) == {HUB, "body-000000000011", "body-000000000012", "body-000000000013"}


@pytest.mark.asyncio
async def test_rebuild_saves_new_pattern_count(monkeypatch):
    output = "body-000000000011"
    document = SimpleNamespace(
        version=7,
        components={
            SOURCE: {"type": "body", "source": {"kind": "browser_extrude"}, "visible": False},
            output: {"type": "body", "source": {"kind": "browser_pattern", "mode": "join"}, "visible": True},
        },
        timeline=[{
            "id": "pa", "kind": "pattern", "body_id": output,
            "params": {**validated_pattern(_linear()), "target_body_id": SOURCE, "engine": "browser_wasm"},
        }],
    )

    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_rebuild.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)
    storage = _WritableStorage()

    await save_browser_rebuild("p", "u", "pa", {"count": 6}, [RebuiltBody(output, b"ISO-10303-21;", _mesh(), NAMING)], {}, 7, None, storage)

    assert document.timeline[0]["params"]["count"] == 6
    assert isinstance(document.timeline[0]["params"]["count"], int)
