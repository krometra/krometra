import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_active_user, get_db, get_storage
from app.main import app
from app.services.geometry_ops.browser_rebuild import RebuiltBody, regen_chain, save_browser_rebuild
from app.services.geometry_ops.browser_regen import save_browser_regen
from app.services.geometry_ops.timeline_state import live_bodies, synced_liveness, with_regen_statuses

pytestmark = pytest.mark.usefixtures("stub_quota")

BOX, FILLET, CUT, TOOL = "body-0000000000b1", "body-0000000000b2", "body-0000000000b3", "body-0000000000b4"
NAMING = json.dumps({"version": 1, "faces": [{"name": "f-a", "fingerprint": [0, 0, 0, 1]}]})


def _mesh() -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {"faces": [{"face_id": "f-a", "edges": []}], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [2.0, 2.0, 0.0]},
        "face_triangle_map": ["f-a"],
    }


class _Storage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    async def get_object(self, key: str) -> bytes | None:
        return self.objects.get(key)

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data


def _browser(**params):
    return {**params, "engine": "browser_wasm"}


def _components() -> dict:
    body = lambda visible: {"type": "body", "source": {"kind": "browser_extrude"}, "visible": visible}  # noqa: E731
    return {BOX: body(False), FILLET: body(False), CUT: body(True), TOOL: body(False)}


def _timeline() -> list:
    return [
        {"id": "box", "kind": "extrude", "status": "ok", "body_id": BOX, "params": _browser(distance=10)},
        {"id": "fillet", "kind": "fillet", "status": "ok", "body_id": FILLET, "params": _browser(target_body_id=BOX, radius=1)},
        {"id": "tool", "kind": "extrude", "status": "ok", "body_id": TOOL, "params": _browser(distance=3)},
        {"id": "cut", "kind": "boolean", "status": "ok", "result_body_id": CUT, "target_body_id": FILLET, "tool_body_id": TOOL, "params": _browser()},
    ]


def _document():
    return SimpleNamespace(version=4, components=_components(), timeline=_timeline())


def _patch(monkeypatch, document):
    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        document.version += 1
        return document

    monkeypatch.setattr("app.services.geometry_ops.browser_rebuild.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_regen.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


def _bodies(*body_ids):
    return [RebuiltBody(body_id, b"ISO-10303-21;", json.dumps(_mesh()), NAMING) for body_id in body_ids]


def _with(timeline: list, entry_id: str, **patch) -> list:
    return [{**entry, **patch} if entry["id"] == entry_id else entry for entry in timeline]


def test_live_bodies_follow_suppression_rollback_and_errors():
    assert live_bodies(_components(), _timeline()) == {CUT}
    assert live_bodies(_components(), _with(_timeline(), "fillet", suppressed=True)) == {CUT}
    assert live_bodies(_components(), _with(_timeline(), "cut", status="error")) == {FILLET, TOOL}
    rolled = _with(_with(_timeline(), "tool", rolled_back=True), "cut", rolled_back=True)
    assert live_bodies(_components(), rolled) == {FILLET}


def test_synced_liveness_flips_only_changed_bodies():
    components = synced_liveness(_components(), _timeline(), _with(_timeline(), "cut", suppressed=True))
    assert {body_id for body_id, body in components.items() if body["visible"]} == {FILLET, TOOL}


def test_regen_statuses_mark_failures_and_clear_rebuilt():
    timeline = with_regen_statuses(_with(_timeline(), "cut", status="error", error_message="old"), {"fillet", "cut"}, {"fillet": "x" * 900})
    assert timeline[1]["status"] == "error" and len(timeline[1]["error_message"]) == 500
    assert timeline[3]["status"] == "ok" and "error_message" not in timeline[3]


def test_regen_chain_starts_from_roots_and_seed_bodies():
    timeline = _timeline()
    assert [entry["id"] for entry in regen_chain(timeline, {}, {"fillet"}, set())] == ["fillet", "cut"]
    assert [entry["id"] for entry in regen_chain(timeline, {}, set(), {TOOL})] == ["cut"]


@pytest.mark.asyncio
async def test_regen_saves_edited_document_and_bodies_of_built_entries(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)
    edited = _with(_timeline(), "fillet", suppressed=True)

    result = await save_browser_regen(
        "p", "u", {"components": _components(), "timeline": edited}, {"roots": ["fillet"], "bodies": []},
        _bodies(CUT), {}, 4, None, storage,
    )

    assert [body["body_id"] for body in result["bodies"]] == [CUT]
    assert document.timeline[1]["suppressed"] is True
    assert document.components[CUT]["bbox"]["max"] == [2.0, 2.0, 0.0]
    assert f"p/geometry/{CUT}.step" in storage.objects
    assert document.version == 5


@pytest.mark.asyncio
async def test_regen_does_not_expect_bodies_of_failed_entries(monkeypatch):
    document = _document()
    _patch(monkeypatch, document)
    edited = _with(_with(_timeline(), "fillet", suppressed=True), "cut", status="error", error_message="Не строится.")

    await save_browser_regen("p", "u", {"components": _components(), "timeline": edited}, {"roots": ["fillet"]}, [], {}, 4, None, _Storage())

    assert document.timeline[3]["status"] == "error"


@pytest.mark.parametrize(("document", "seeds", "bodies", "version", "code"), [
    ({"components": {}, "timeline": "x"}, {"roots": []}, (), 4, "invalid_regen_document"),
    ({"components": {"bad key!": {}}, "timeline": []}, {"roots": []}, (), 4, "invalid_regen_document"),
    (None, {"roots": ["../x"]}, (), 4, "invalid_regen_document"),
    (None, {"roots": ["fillet"]}, (CUT, FILLET), 4, "rebuild_bodies_mismatch"),
    (None, {"roots": ["fillet"]}, (CUT,), 3, "version_conflict"),
])
@pytest.mark.asyncio
async def test_regen_rejects_inconsistent_requests(monkeypatch, document, seeds, bodies, version, code):
    stored = _document()
    storage = _Storage()
    _patch(monkeypatch, stored)
    sent = document or {"components": _components(), "timeline": _with(_timeline(), "fillet", suppressed=True)}

    with pytest.raises(HTTPException) as error:
        await save_browser_regen("p", "u", sent, seeds, _bodies(*bodies), {}, version, None, storage)

    assert error.value.detail["error"] == code
    assert storage.objects == {}
    assert stored.version == 4


@pytest.mark.asyncio
async def test_param_rebuild_marks_failed_dependents_and_shows_their_input(monkeypatch):
    document = _document()
    _patch(monkeypatch, document)

    await save_browser_rebuild("p", "u", "fillet", {"radius": 2}, _bodies(FILLET), {}, 4, None, _Storage(), {"cut": "Не строится."})

    assert document.timeline[1]["params"]["radius"] == 2.0
    assert document.timeline[3] == {**_timeline()[3], "status": "error", "error_message": "Не строится."}
    assert {body_id for body_id, body in document.components.items() if body["visible"]} == {FILLET, TOOL}


@pytest.mark.parametrize("failed", [{"fillet": "x"}, {"tool": "x"}, {"cut": 5}])
@pytest.mark.asyncio
async def test_param_rebuild_rejects_failures_outside_dependents(monkeypatch, failed):
    document = _document()
    _patch(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await save_browser_rebuild("p", "u", "fillet", {"radius": 2}, _bodies(FILLET), {}, 4, None, _Storage(), failed)

    assert error.value.detail["error"] in {"rebuild_failures_mismatch", "invalid_rebuild_params"}
    assert document.version == 4


@pytest.mark.asyncio
async def test_regen_route_accepts_multipart_document(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)

    async def fake_db():
        yield None

    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id="u")
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_storage] = lambda: storage
    try:
        data = {
            "document": json.dumps({"components": _components(), "timeline": _with(_timeline(), "fillet", suppressed=True)}),
            "seeds": json.dumps({"roots": ["fillet"], "bodies": []}),
            "document_version": "4",
            "bodies": json.dumps([CUT]),
            f"mesh:{CUT}": json.dumps(_mesh()),
            f"naming:{CUT}": NAMING,
        }
        files = {f"step:{CUT}": (f"{CUT}.step", b"ISO-10303-21;", "application/step")}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/projects/p/geometry/browser-regen", data=data, files=files)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert document.timeline[1]["suppressed"] is True
