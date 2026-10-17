import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.geometry_ops.browser_extrude import save_browser_extrude
from app.services.geometry_ops.profile_regions import MAX_PROFILE_REGIONS, parse_profile_regions

pytestmark = pytest.mark.usefixtures("stub_quota")


def _browser_mesh() -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {"faces": [{"face_id": 1, "edges": []}], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 0.0]},
        "face_triangle_map": [1],
    }


class _Storage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data


@pytest.fixture
def document(monkeypatch):
    doc = SimpleNamespace(
        version=3,
        components={"sketch-1": {"plane": "XY", "entities": [], "constraints": []}},
        timeline=[],
    )

    async def get_document(*_args):
        return doc

    async def save_document(_db, _project_id, _user_id, update):
        doc.components = update.components
        doc.timeline = update.timeline
        return doc

    monkeypatch.setattr("app.services.geometry_ops.browser_extrude.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)
    return doc


async def _save(**overrides):
    params = {
        "project_id": "project",
        "user_id": "user",
        "sketch_id": "sketch-1",
        "distance": 10,
        "direction": "one_side",
        "document_version": 3,
        "step_bytes": b"ISO-10303-21;",
        "mesh_json": json.dumps(_browser_mesh()),
        "db": None,
        "storage": _Storage(),
        **overrides,
    }
    return await save_browser_extrude(**params)


def test_parses_region_keys_and_drops_duplicates():
    assert parse_profile_regions('["r0abc12", "r0abc12~2", "r0abc12"]') == ["r0abc12", "r0abc12~2"]


@pytest.mark.parametrize("value", [None, "", "[]"])
def test_empty_selection_means_whole_sketch(value):
    assert parse_profile_regions(value) == []


@pytest.mark.parametrize(
    "value",
    ["not json", '{"a": 1}', '[1]', '["has space"]', '["' + "x" * 65 + '"]', json.dumps(["r"] * (MAX_PROFILE_REGIONS + 1))],
)
def test_rejects_malformed_region_lists(value):
    with pytest.raises(HTTPException) as caught:
        parse_profile_regions(value)
    assert caught.value.status_code == 400
    assert caught.value.detail["error"] == "invalid_profile_regions"


@pytest.mark.asyncio
async def test_extrude_records_selected_regions(document):
    result = await _save(profile_regions=["r1", "r2"])

    assert document.timeline[-1]["params"]["profile_regions"] == ["r1", "r2"]
    assert document.components[result["body_id"]]["source"]["profile_regions"] == ["r1", "r2"]


@pytest.mark.asyncio
async def test_extrude_without_selection_keeps_old_params(document):
    result = await _save()

    assert "profile_regions" not in document.timeline[-1]["params"]
    assert "profile_regions" not in document.components[result["body_id"]]["source"]


@pytest.mark.asyncio
async def test_revolve_records_selected_regions(document):
    await _save(
        feature_kind="revolve", distance=0, axis_origin={"x": 0.0, "y": 0.0}, axis="y", angle=360.0, profile_regions=["r9"],
    )

    assert document.timeline[-1]["kind"] == "revolve"
    assert document.timeline[-1]["params"]["profile_regions"] == ["r9"]
