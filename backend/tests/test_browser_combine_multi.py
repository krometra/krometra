import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.main import app
from app.schemas.document import DocumentUpdate
from app.services.geometry_ops.browser_boolean import parse_tool_body_ids, save_browser_boolean
from app.services.geometry_ops.browser_extrude_cuts import parse_cut_targets, save_browser_extrude_cuts
from app.services.geometry_ops.browser_import import ImportedBody
from app.services.geometry_ops.browser_rebuild import affected_bodies, input_bodies
from app.services.geometry_ops.timeline_state import consumed_bodies, live_bodies, output_fallbacks

pytestmark = pytest.mark.usefixtures("stub_quota")

TARGET = "body-aaaaaaaaaaaa"
TOOL_A = "body-bbbbbbbbbbbb"
TOOL_B = "body-cccccccccccc"
OTHER = "body-dddddddddddd"
NAMING = json.dumps({"version": 1, "faces": [{"name": "f-a", "fingerprint": [0, 0, 0, 1]}]})


class _Storage:
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


def _document(**bodies):
    components = {body_id: {"type": "body", "source": {"kind": kind}, "visible": True} for body_id, kind in bodies.items()}
    components["s1"] = {"type": "sketch", "entities": []}
    return SimpleNamespace(version=3, components=components, timeline=[])


def _patch(monkeypatch, document, module):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        return document

    monkeypatch.setattr(f"app.services.geometry_ops.{module}.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


async def _combine(tools, keep_tools=False):
    return await save_browser_boolean(
        "p", "u", "subtract", TARGET, tools[0], 3, b"ISO-10303-21;", _mesh(), None, _Storage(),
        keep_tools=keep_tools, tool_body_ids=tools,
    )


@pytest.mark.asyncio
async def test_combine_with_several_tools_hides_target_and_every_tool(monkeypatch):
    document = _document(**{TARGET: "browser_extrude", TOOL_A: "browser_extrude", TOOL_B: "browser_extrude"})
    _patch(monkeypatch, document, "browser_boolean")

    result = await _combine([TOOL_A, TOOL_B])

    entry = document.timeline[-1]
    assert entry["tool_body_id"] == TOOL_A
    assert entry["tool_body_ids"] == [TOOL_A, TOOL_B]
    assert "keep_tools" not in entry["params"]
    assert all(document.components[body]["visible"] is False for body in (TARGET, TOOL_A, TOOL_B))
    assert document.components[result["result_body_id"]]["source"]["tool_body_ids"] == [TOOL_A, TOOL_B]
    assert consumed_bodies(entry) == [TARGET, TOOL_A, TOOL_B]
    assert input_bodies(entry) == {TARGET, TOOL_A, TOOL_B}


@pytest.mark.asyncio
async def test_combine_keeping_tools_hides_only_target(monkeypatch):
    document = _document(**{TARGET: "browser_extrude", TOOL_A: "browser_extrude", TOOL_B: "browser_extrude"})
    _patch(monkeypatch, document, "browser_boolean")

    await _combine([TOOL_A, TOOL_B], keep_tools=True)

    entry = document.timeline[-1]
    assert entry["params"]["keep_tools"] is True
    assert document.components[TARGET]["visible"] is False
    assert document.components[TOOL_A]["visible"] is True
    assert document.components[TOOL_B]["visible"] is True
    assert consumed_bodies(entry) == [TARGET]
    assert live_bodies(document.components, document.timeline) == {TOOL_A, TOOL_B, entry["result_body_id"]}


@pytest.mark.asyncio
async def test_combine_rejects_target_among_tools(monkeypatch):
    _patch(monkeypatch, _document(**{TARGET: "browser_extrude", TOOL_A: "browser_extrude"}), "browser_boolean")
    with pytest.raises(HTTPException) as error:
        await _combine([TOOL_A, TARGET])
    assert error.value.detail["error"] == "invalid_boolean_params"


@pytest.mark.parametrize("raw", ["not json", "[]", json.dumps([TOOL_B]), json.dumps([TOOL_A, TOOL_A]), json.dumps([TOOL_A, 1])])
def test_tool_list_is_validated(raw):
    with pytest.raises(HTTPException) as error:
        parse_tool_body_ids(TOOL_A, raw)
    assert error.value.detail["error"] == "invalid_boolean_params"


def test_tool_list_falls_back_to_single_tool():
    assert parse_tool_body_ids(TOOL_A, None) == [TOOL_A]
    assert parse_tool_body_ids(TOOL_A, json.dumps([TOOL_A, TOOL_B])) == [TOOL_A, TOOL_B]


def _bodies(count):
    return [ImportedBody(b"ISO-10303-21;", _mesh(), NAMING) for _ in range(count)]


async def _cut(targets, bodies=None, version=3):
    return await save_browser_extrude_cuts(
        "p", "u", "s1", -4.0, "one_side", targets, _bodies(len(targets) if bodies is None else bodies), version, None, _Storage(),
        feature_key="k-0011223344556677", extent_type="through_all",
    )


def test_extrude_cuts_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/geometry/browser-extrude-cuts"]
    assert path["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/PatternResponse")


@pytest.mark.asyncio
async def test_cut_through_several_bodies_records_one_entry_with_target_list(monkeypatch):
    document = _document(**{TARGET: "browser_extrude", TOOL_A: "browser_extrude", OTHER: "browser_extrude"})
    _patch(monkeypatch, document, "browser_extrude_cuts")

    result = await _cut([TARGET, TOOL_A])

    body_ids = [body["body_id"] for body in result["bodies"]]
    assert result["hidden_body_ids"] == [TARGET, TOOL_A]
    assert len(document.timeline) == 1
    entry = document.timeline[0]
    assert entry["body_id"] == body_ids[0]
    assert entry["body_ids"] == body_ids
    assert entry["params"]["target_body_id"] == TARGET
    assert entry["params"]["target_body_ids"] == [TARGET, TOOL_A]
    assert entry["params"]["extent_type"] == "through_all"
    assert [document.components[body]["source"]["target_body_id"] for body in body_ids] == [TARGET, TOOL_A]
    assert document.components[OTHER]["visible"] is True
    assert consumed_bodies(entry) == [TARGET, TOOL_A]
    assert output_fallbacks(entry) == list(zip(body_ids, [TARGET, TOOL_A]))
    assert live_bodies(document.components, document.timeline) == {OTHER, *body_ids}


@pytest.mark.asyncio
async def test_suppressed_cut_brings_every_target_back(monkeypatch):
    document = _document(**{TARGET: "browser_extrude", TOOL_A: "browser_extrude"})
    _patch(monkeypatch, document, "browser_extrude_cuts")
    result = await _cut([TARGET, TOOL_A])
    suppressed = [{**document.timeline[0], "suppressed": True}]

    assert live_bodies(document.components, suppressed) == {TARGET, TOOL_A}
    assert affected_bodies(document.timeline, 0, document.components) == {body["body_id"] for body in result["bodies"]}


@pytest.mark.asyncio
async def test_cut_rejects_consumed_target_and_mismatched_uploads(monkeypatch):
    document = _document(**{TARGET: "browser_extrude", TOOL_A: "browser_extrude"})
    _patch(monkeypatch, document, "browser_extrude_cuts")
    await _cut([TARGET, TOOL_A])
    document.version = 3

    with pytest.raises(HTTPException) as stale:
        await _cut([TARGET])
    assert stale.value.status_code == 409
    with pytest.raises(HTTPException) as mismatch:
        await _cut([document.timeline[0]["body_ids"][0]], bodies=2)
    assert mismatch.value.detail["error"] == "cut_bodies_mismatch"


@pytest.mark.asyncio
async def test_cut_rejects_non_browser_target(monkeypatch):
    _patch(monkeypatch, _document(**{TARGET: "browser_extrude", TOOL_A: "extrude"}), "browser_extrude_cuts")
    with pytest.raises(HTTPException) as error:
        await _cut([TARGET, TOOL_A])
    assert error.value.detail["error"] == "target_not_browser"


@pytest.mark.parametrize("raw", ["{}", "[]", json.dumps([TARGET, TARGET]), json.dumps([TARGET, ""])])
def test_cut_target_list_is_validated(raw):
    with pytest.raises(HTTPException) as error:
        parse_cut_targets(raw)
    assert error.value.detail["error"] == "invalid_extrude_params"


@pytest.mark.parametrize("entry", [
    {"id": "e1", "kind": "boolean", "tool_body_ids": ["../etc"]},
    {"id": "e1", "kind": "extrude", "params": {"target_body_ids": [TARGET, 7]}},
    {"id": "e1", "kind": "extrude", "body_ids": TARGET},
])
def test_document_rejects_malformed_body_lists(entry):
    with pytest.raises(ValidationError):
        DocumentUpdate(timeline=[entry], version=1)


def test_document_accepts_body_lists():
    entry = {"id": "e1", "kind": "boolean", "tool_body_ids": [TOOL_A, TOOL_B], "params": {"target_body_ids": [TARGET]}}
    assert DocumentUpdate(timeline=[entry], version=1).timeline == [entry]
