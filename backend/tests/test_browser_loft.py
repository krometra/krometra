import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.services.geometry_ops.browser_loft import BrowserLoftParams, parsed_profile_sketch_ids, save_browser_loft
from app.services.geometry_ops.browser_rebuild import affected_bodies, validated_rebuild_params
from app.services.geometry_ops.browser_sketch_seat import feature_sketch_owner
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


def _sketch(offset=0.0):
    return {"plane": "XY", "plane_offset": offset, "entities": [], "constraints": []}


def _document():
    return SimpleNamespace(
        version=3,
        components={
            "s-bottom": _sketch(),
            "s-middle": _sketch(15.0),
            "s-top": _sketch(30.0),
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

    monkeypatch.setattr("app.services.geometry_ops.browser_loft.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


def _params(**patch):
    values = {"profile_sketch_ids": ("s-bottom", "s-middle", "s-top"), "transition": "smooth", "operation": "new_body", "target_body_id": None}
    return BrowserLoftParams(**{**values, **patch})


async def _save(document, version=3, **patch):
    return await save_browser_loft(
        "project", "user", _params(**patch), version, b"ISO-10303-21;", json.dumps(_browser_mesh()), None, _WritableStorage(),
        feature_key="k-0011223344556677",
    )


def test_browser_loft_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-loft"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/ExtrudeResponse")


@pytest.mark.asyncio
async def test_loft_records_all_profiles_in_order(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    result = await _save(document)

    entry = document.timeline[-1]
    assert entry["kind"] == "loft"
    assert entry["label"] == "Лофт 1"
    assert entry["sketch_id"] == "s-bottom"
    assert entry["body_id"] == result["body_id"]
    assert entry["params"] == {
        "profile_sketch_ids": ["s-bottom", "s-middle", "s-top"], "transition": "smooth", "operation": "new_body",
        "feature_key": "k-0011223344556677", "engine": "browser_wasm",
    }
    source = document.components[result["body_id"]]["source"]
    assert source["kind"] == "browser_loft"
    assert source["profile_sketch_ids"] == ["s-bottom", "s-middle", "s-top"]
    assert result["hidden_body_ids"] == []


@pytest.mark.asyncio
async def test_loft_cut_consumes_target(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    result = await _save(document, operation="cut", target_body_id=TARGET, transition="ruled")

    assert result["hidden_body_ids"] == [TARGET]
    assert document.components[TARGET]["visible"] is False
    assert document.timeline[-1]["params"]["target_body_id"] == TARGET
    assert document.timeline[-1]["params"]["transition"] == "ruled"
    assert resolve_target_body(document.components, TARGET) == result["body_id"]


@pytest.mark.parametrize(("patch", "code"), [
    ({"profile_sketch_ids": ("s-bottom",)}, "invalid_loft_params"),
    ({"profile_sketch_ids": ("s-bottom", "s-bottom")}, "invalid_loft_params"),
    ({"transition": "twisted"}, "invalid_loft_params"),
    ({"profile_sketch_ids": ("s-bottom", "../evil")}, "invalid_sketch_id"),
    ({"profile_sketch_ids": ("s-bottom", "s-missing")}, "sketch_not_found"),
    ({"operation": "cut"}, "target_required"),
    ({"operation": "xor"}, "invalid_extrude_params"),
])
@pytest.mark.asyncio
async def test_loft_rejects_invalid_requests(monkeypatch, patch, code):
    document = _document()
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save(document, **patch)

    assert error.value.detail["error"] == code
    assert document.timeline == []


@pytest.mark.asyncio
async def test_loft_rejects_stale_document(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await _save(document, version=2)

    assert error.value.status_code == 409


def test_profile_ids_arrive_as_json_list():
    assert parsed_profile_sketch_ids('["s-a", "s-b"]') == ("s-a", "s-b")
    for raw in ("s-a,s-b", '{"a": 1}', "[1, 2]"):
        with pytest.raises(HTTPException) as error:
            parsed_profile_sketch_ids(raw)
        assert error.value.detail["error"] == "invalid_loft_params"


def test_loft_transition_is_editable_after_the_fact():
    assert validated_rebuild_params("loft", {"transition": "ruled"}) == {"transition": "ruled"}
    with pytest.raises(HTTPException) as error:
        validated_rebuild_params("loft", {"transition": "spiral"})
    assert error.value.detail["error"] == "invalid_rebuild_params"


def test_loft_depends_on_first_profile_owner():
    components = {
        "s-face": {"plane": "XY", "entities": [], "ref_body_id": "body-000000000001", "ref_face_id": "f-top"},
        "body-000000000001": {"type": "body", "source": {"kind": "browser_extrude"}},
    }
    loft = {"id": "lf", "kind": "loft", "sketch_id": "s-face", "body_id": "body-000000000002", "params": {"engine": "browser_wasm"}}
    timeline = [
        {"id": "e1", "kind": "extrude", "body_id": "body-000000000001", "params": {"engine": "browser_wasm"}},
        loft,
    ]

    assert feature_sketch_owner(components, loft) == "body-000000000001"
    assert affected_bodies(timeline, 0, components) == {"body-000000000001", "body-000000000002"}
