import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.geometry_ops.browser_extrude import save_browser_extrude

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


def _document(**bodies):
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


@pytest.fixture
def document(monkeypatch):
    doc = _document(**{"body-aaaaaaaaaaaa": "browser_extrude", "body-cccccccccccc": "extrude"})

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


def _saved_params(document, result):
    return document.components[result["body_id"]]["source"], document.timeline[-1]["params"]


@pytest.mark.asyncio
async def test_distance_extrude_records_extent_type(document):
    source, params = _saved_params(document, await _save())

    assert source["extent_type"] == "distance"
    assert params["extent_type"] == "distance"
    assert "back_distance" not in params and "offset" not in params


@pytest.mark.asyncio
async def test_two_sided_extrude_records_back_distance(document):
    source, params = _saved_params(document, await _save(direction="two_sided", back_distance=4.5))

    assert source["direction"] == "two_sided"
    assert source["back_distance"] == 4.5
    assert params["back_distance"] == 4.5


@pytest.mark.asyncio
async def test_up_to_face_cut_records_target_face_and_offset(document):
    result = await _save(
        distance=-1, operation="cut", target_body_id="body-aaaaaaaaaaaa",
        extent_type="up_to_face", up_to_body_id="body-aaaaaaaaaaaa", up_to_face_id="7", offset=-1.5,
    )
    source, params = _saved_params(document, result)

    assert source["up_to_body_id"] == "body-aaaaaaaaaaaa"
    assert source["up_to_face_id"] == "7"
    assert source["offset"] == -1.5
    assert params["extent_type"] == "up_to_face"
    assert params["target_body_id"] == "body-aaaaaaaaaaaa"


@pytest.mark.asyncio
async def test_through_all_join_records_extent(document):
    source, _ = _saved_params(document, await _save(operation="join", target_body_id="body-aaaaaaaaaaaa", extent_type="through_all"))

    assert source["extent_type"] == "through_all"
    assert source["target_body_id"] == "body-aaaaaaaaaaaa"


@pytest.mark.parametrize(("overrides", "code"), [
    ({"extent_type": "sideways"}, "invalid_extrude_params"),
    ({"direction": "two_sided"}, "invalid_extrude_params"),
    ({"direction": "two_sided", "back_distance": float("nan")}, "invalid_extrude_params"),
    ({"extent_type": "through_all"}, "through_all_new_body"),
    ({"extent_type": "up_to_face", "up_to_body_id": "body-aaaaaaaaaaaa"}, "up_to_face_required"),
    ({"extent_type": "up_to_body", "up_to_body_id": "body-cccccccccccc"}, "up_to_target_required"),
    ({"extent_type": "up_to_body"}, "up_to_target_required"),
    ({"extent_type": "up_to_body", "up_to_body_id": "body-aaaaaaaaaaaa", "direction": "symmetric"}, "invalid_extrude_params"),
])
@pytest.mark.asyncio
async def test_invalid_extent_is_rejected(document, overrides, code):
    with pytest.raises(HTTPException) as error:
        await _save(**overrides)

    assert error.value.detail["error"] == code


@pytest.mark.asyncio
async def test_revolve_rejects_two_sided_direction(document):
    with pytest.raises(HTTPException) as error:
        await _save(feature_kind="revolve", distance=0, direction="two_sided", axis_origin={"x": 0, "y": 0}, axis="y", angle=90)

    assert error.value.detail["error"] == "invalid_extrude_params"
