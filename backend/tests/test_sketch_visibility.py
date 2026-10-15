from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_active_user, get_db
from app.main import app
from app.schemas.sketch import SketchData, sketch_component

LINE = {"id": "l1", "type": "line", "start": {"x": 0, "y": 0}, "end": {"x": 10, "y": 0}}


def test_sketch_component_keeps_hidden_flag():
    component = sketch_component(SketchData(entities=[LINE]), {"plane": "XZ", "entities": [], "visible": False})

    assert component["visible"] is False
    assert component["plane"] == "XY"
    assert component["entities"][0]["id"] == "l1"


def test_sketch_component_of_new_or_never_hidden_sketch_has_no_flag():
    assert "visible" not in sketch_component(SketchData(), None)
    assert "visible" not in sketch_component(SketchData(), {"plane": "XY", "entities": []})


def test_sketch_component_ignores_non_dict_previous():
    assert "visible" not in sketch_component(SketchData(), "garbage")


@pytest.mark.asyncio
async def test_saving_hidden_sketch_keeps_it_hidden(monkeypatch):
    document = SimpleNamespace(
        version=3,
        components={"sketch-a": {"plane": "XY", "plane_offset": 0.0, "entities": [], "constraints": [], "visible": False}},
        timeline=[{"id": "tl-1", "kind": "sketch", "sketch_id": "sketch-a", "label": "Эскиз 1"}],
    )

    async def get_document(*_args):
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        document.version += 1
        return document

    async def fake_db():
        yield None

    monkeypatch.setattr("app.api.routes.sketches.get_document", get_document)
    monkeypatch.setattr("app.api.routes.sketches.save_document", save_document)
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id="u")
    app.dependency_overrides[get_db] = fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            saved = await client.put("/api/projects/p/sketches/sketch-a", json={"plane": "XY", "entities": [LINE], "constraints": []})
            loaded = await client.get("/api/projects/p/sketches/sketch-a")
    finally:
        app.dependency_overrides.clear()

    assert saved.status_code == 200, saved.text
    assert document.components["sketch-a"]["visible"] is False
    assert document.components["sketch-a"]["entities"][0]["id"] == "l1"
    assert loaded.status_code == 200, loaded.text
    assert loaded.json()["entities"][0]["id"] == "l1"
