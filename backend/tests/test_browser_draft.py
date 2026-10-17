import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.services.geometry_ops.browser_draft import draft_neutral_params, save_browser_draft, validated_draft_params
from app.services.geometry_ops.browser_rebuild import validated_rebuild_params

pytestmark = pytest.mark.usefixtures("stub_quota")

SOURCE = "body-aaaaaaaaaaaa"
FACES = ["f-left", "f-right"]
NEUTRAL = {"neutral_plane": None, "neutral_face_id": "f-bottom"}


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

    monkeypatch.setattr("app.services.geometry_ops.browser_draft.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


async def _save(document, params=None, version=3, storage=None):
    return await save_browser_draft(
        "project", "user", SOURCE, params or validated_draft_params(FACES, NEUTRAL, 3, False), version,
        b"ISO-10303-21;", json.dumps(_browser_mesh()), None, storage or _WritableStorage(),
        feature_key="k-0011223344556677",
    )


def test_browser_draft_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-draft"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/ExtrudeResponse")


@pytest.mark.asyncio
async def test_draft_hides_source_and_records_feature(monkeypatch):
    document = _document()
    _patch_document(monkeypatch, document)
    storage = _WritableStorage()

    result = await _save(document, validated_draft_params(FACES, draft_neutral_params("XZ", None), 5, True), storage=storage)

    assert result["hidden_body_ids"] == [SOURCE]
    assert document.components[SOURCE]["visible"] is False
    assert document.components[result["body_id"]]["source"]["kind"] == "browser_draft"
    entry = document.timeline[-1]
    assert entry["kind"] == "draft"
    assert entry["label"] == "Уклон 1"
    assert entry["body_id"] == result["body_id"]
    assert entry["params"] == {
        "target_body_id": SOURCE, "face_ids": FACES, "neutral_plane": "XZ", "neutral_face_id": None,
        "angle_deg": 5.0, "reverse": True, "feature_key": "k-0011223344556677", "engine": "browser_wasm",
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


@pytest.mark.parametrize("angle, reverse", [(0, False), (-3, False), (90, False), (float("nan"), False), (True, False), (3, "yes")])
def test_invalid_angle_and_reverse_are_rejected(angle, reverse):
    with pytest.raises(HTTPException) as error:
        validated_draft_params(FACES, NEUTRAL, angle, reverse)
    assert error.value.detail["error"] == "invalid_draft_params"


def test_neutral_face_cannot_be_drafted():
    with pytest.raises(HTTPException) as error:
        validated_draft_params(["f-bottom", "f-left"], NEUTRAL, 3, False)
    assert error.value.detail["error"] == "invalid_draft_params"


def test_draft_params_are_normalized():
    assert validated_draft_params(FACES, NEUTRAL, 3, False) == {
        "face_ids": FACES, "neutral_plane": None, "neutral_face_id": "f-bottom", "angle_deg": 3.0, "reverse": False,
    }


@pytest.mark.parametrize("plane, face_id", [(None, None), ("XY", "f-bottom"), ("XW", None), (None, "bottom"), (None, "f-" + "x" * 300)])
def test_neutral_is_validated(plane, face_id):
    with pytest.raises(HTTPException) as error:
        draft_neutral_params(plane, face_id)
    assert error.value.detail["error"] == "invalid_draft_params"


def test_neutral_plane_and_face_are_parsed():
    assert draft_neutral_params("YZ", None) == {"neutral_plane": "YZ", "neutral_face_id": None}
    assert draft_neutral_params(None, "f-bottom~1") == {"neutral_plane": None, "neutral_face_id": "f-bottom~1"}


def test_rebuild_accepts_only_angle():
    assert validated_rebuild_params("draft", {"angle_deg": 7}) == {"angle_deg": 7.0}
    for params in ({"angle_deg": 0}, {"angle_deg": 95}, {"angle_deg": True}, {"reverse": True}, {"face_ids": ["f-a"]}, {"neutral_plane": "XY"}):
        with pytest.raises(HTTPException) as error:
            validated_rebuild_params("draft", params)
        assert error.value.detail["error"] == "invalid_rebuild_params"
