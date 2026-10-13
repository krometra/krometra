import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_active_user, get_db, get_storage
from app.main import app
from app.services.geometry_ops.browser_boolean import save_browser_boolean
from app.services.geometry_ops.browser_import import (
    ImportedBody,
    import_file_name,
    paired_import_bodies,
    save_browser_import,
)
from app.services.geometry_ops.browser_rebuild import affected_bodies, validated_rebuild_params
from app.services.geometry_ops.limits import MAX_IMPORT_BODIES, MAX_STEP_BYTES

pytestmark = pytest.mark.usefixtures("stub_quota")

OWNER = "owner"
NAMING = json.dumps({"version": 1, "faces": [{"name": "f-a", "fingerprint": [0, 0, 0, 1]}]})


def _mesh(size: float = 1.0) -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, size, 0.0, 0.0, 0.0, size, 0.0],
        "indices": [0, 1, 2],
        "brep_topo": {"faces": [{"face_id": "f-a", "edges": []}], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [size, size, 0.0]},
        "face_triangle_map": ["f-a"],
    }


def _body(index: int = 0, **overrides) -> ImportedBody:
    fields = {"step": b"ISO-10303-21;%d" % index, "mesh_json": json.dumps(_mesh(index + 1.0)), "naming_json": NAMING}
    return ImportedBody(**{**fields, **overrides})


class _Storage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    async def get_object(self, key: str) -> bytes | None:
        return self.objects.get(key)

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data


def _document(**components):
    return SimpleNamespace(version=4, components=components, timeline=[])


def _patch(monkeypatch, document, modules=("browser_import",)):
    async def get_document(_db, _project_id, user_id):
        if user_id != OWNER:
            raise HTTPException(status_code=404, detail={"error": "project_not_found", "error_description": "Проект не найден."})
        return document

    async def save_document(_db, _project_id, _user_id, update):
        document.components = update.components
        document.timeline = update.timeline
        document.version += 1
        return document

    for module in modules:
        monkeypatch.setattr(f"app.services.geometry_ops.{module}.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


@pytest.mark.asyncio
async def test_import_adds_browser_bodies_with_timeline_entries(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)

    result = await save_browser_import("p", OWNER, "bracket.step", [_body(0), _body(1)], 4, None, storage)

    body_ids = [body["body_id"] for body in result["bodies"]]
    assert len(set(body_ids)) == 2
    assert document.version == 5
    for index, body_id in enumerate(body_ids):
        component = document.components[body_id]
        assert component["source"] == {"kind": "browser_import", "file_name": "bracket.step", "body_index": index, "body_count": 2}
        assert component["visible"] is True
        assert component["bbox"]["max"] == [index + 1.0, index + 1.0, 0.0]
        assert storage.objects[f"p/geometry/{body_id}.step"] == b"ISO-10303-21;%d" % index
        assert json.loads(storage.objects[f"p/geometry/{body_id}.mesh"])["bbox"]["max"][0] == index + 1.0
        assert json.loads(storage.objects[f"p/geometry/{body_id}.naming.json"])["faces"][0]["name"] == "f-a"
    assert [(entry["kind"], entry["label"], entry["body_id"]) for entry in document.timeline] == [
        ("import", "Импорт 1", body_ids[0]),
        ("import", "Импорт 2", body_ids[1]),
    ]
    assert all(entry["params"]["engine"] == "browser_wasm" and entry["status"] == "ok" for entry in document.timeline)


@pytest.mark.asyncio
async def test_import_keeps_existing_document_content(monkeypatch):
    document = _document(**{"sketch-1": {"plane": "XY", "entities": []}})
    document.timeline = [{"id": "tl-1", "kind": "import", "label": "Импорт 1", "body_id": "body-00000000000a"}]
    _patch(monkeypatch, document)

    await save_browser_import("p", OWNER, "part.stp", [_body()], 4, None, _Storage())

    assert "sketch-1" in document.components
    assert [entry["label"] for entry in document.timeline] == ["Импорт 1", "Импорт 2"]


@pytest.mark.parametrize(("bodies", "version", "code", "http_status"), [
    ([], 4, "import_no_bodies", 400),
    ([_body(index) for index in range(MAX_IMPORT_BODIES + 1)], 4, "too_many_import_bodies", 413),
    ([_body()], 3, "version_conflict", 409),
    ([_body(), _body(1, step=b"")], 4, "empty_browser_step", 400),
    ([_body(step=b"x" * (MAX_STEP_BYTES + 1))], 4, "browser_step_too_large", 413),
    ([_body(mesh_json="{")], 4, "invalid_browser_mesh", 400),
    ([_body(naming_json="[]")], 4, "invalid_browser_naming", 400),
])
@pytest.mark.asyncio
async def test_import_rejects_invalid_requests_without_side_effects(monkeypatch, bodies, version, code, http_status):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await save_browser_import("p", OWNER, "part.step", bodies, version, None, storage)

    assert error.value.detail["error"] == code
    assert error.value.status_code == http_status
    assert storage.objects == {}
    assert document.components == {} and document.timeline == [] and document.version == 4


@pytest.mark.asyncio
async def test_import_into_foreign_project_is_hidden(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)

    with pytest.raises(HTTPException) as error:
        await save_browser_import("p", "stranger", "part.step", [_body()], 4, None, storage)

    assert error.value.status_code == 404
    assert storage.objects == {} and document.components == {}


@pytest.mark.parametrize(("raw", "expected"), [
    ("bracket.step", "bracket.step"),
    ("C:\\models\\Кронштейн v2.STP", "Кронштейн v2.STP"),
    ("../../etc/passwd", "passwd"),
    ("  \n\t ", "import.step"),
    ("a" * 500 + ".step", "a" * 120),
])
def test_import_file_name_is_reduced_to_a_safe_label(raw, expected):
    assert import_file_name(raw) == expected


def test_import_requires_step_mesh_and_naming_for_every_body():
    with pytest.raises(HTTPException) as error:
        paired_import_bodies([b"ISO-10303-21;", b"ISO-10303-21;"], [json.dumps(_mesh())], [NAMING, NAMING])

    assert error.value.detail["error"] == "import_bodies_mismatch"


@pytest.mark.asyncio
async def test_imported_bodies_take_part_in_boolean(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document, modules=("browser_import", "browser_boolean"))
    imported = await save_browser_import("p", OWNER, "pair.step", [_body(0), _body(1)], 4, None, storage)
    target, tool = (body["body_id"] for body in imported["bodies"])

    result = await save_browser_boolean("p", OWNER, "union", target, tool, 5, b"ISO-10303-21;", json.dumps(_mesh()), None, storage)

    assert document.components[result["result_body_id"]]["source"]["kind"] == "browser_boolean"
    assert document.components[target]["visible"] is False
    assert document.timeline[-1]["kind"] == "boolean"


@pytest.mark.asyncio
async def test_import_entry_is_a_parameterless_rebuild_root(monkeypatch):
    document = _document()
    _patch(monkeypatch, document)
    imported = await save_browser_import("p", OWNER, "part.step", [_body(0), _body(1)], 4, None, _Storage())
    first, second = (body["body_id"] for body in imported["bodies"])
    timeline = [
        *document.timeline,
        {"id": "f1", "kind": "fillet", "body_id": "body-0000000000f1", "params": {"target_body_id": first, "radius": 1, "engine": "browser_wasm"}},
    ]

    assert affected_bodies(timeline, 0, document.components) == {first, "body-0000000000f1"}
    assert affected_bodies(timeline, 1, document.components) == {second}
    assert validated_rebuild_params("import", {}) == {}
    with pytest.raises(HTTPException) as error:
        validated_rebuild_params("import", {"distance": 5})
    assert error.value.detail["error"] == "invalid_rebuild_params"


def _overrides(storage, user_id=OWNER):
    async def fake_db():
        yield None

    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id=user_id)
    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_storage] = lambda: storage


def _multipart(count: int, meshes: int | None = None) -> dict:
    files = [("steps", (f"import-{index}.step", b"ISO-10303-21;", "application/step")) for index in range(count)]
    fields = [("meshes", json.dumps(_mesh())) for _ in range(count if meshes is None else meshes)]
    fields += [("namings", NAMING) for _ in range(count)]
    data: dict[str, list[str] | str] = {"file_name": "pair.step", "document_version": "4"}
    for key, value in fields:
        data.setdefault(key, []).append(value)
    return {"data": data, "files": files}


async def _post(**request):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.post("/api/projects/p/geometry/browser-import", **request)


@pytest.mark.asyncio
async def test_import_route_accepts_several_bodies(monkeypatch):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)
    _overrides(storage)
    try:
        response = await _post(**_multipart(2))
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    bodies = response.json()["bodies"]
    assert len(bodies) == 2 and all(body["mesh"]["face_triangle_map"] == ["f-a"] for body in bodies)
    assert sorted(document.components) == sorted(body["body_id"] for body in bodies)
    assert len(storage.objects) == 6


@pytest.mark.parametrize(("request_parts", "user_id", "http_status", "code"), [
    (_multipart(2, meshes=1), OWNER, 400, "import_bodies_mismatch"),
    (_multipart(MAX_IMPORT_BODIES + 1), OWNER, 413, "too_many_import_bodies"),
    (_multipart(1), "stranger", 404, "project_not_found"),
])
@pytest.mark.asyncio
async def test_import_route_rejects_bad_requests(monkeypatch, request_parts, user_id, http_status, code):
    document = _document()
    storage = _Storage()
    _patch(monkeypatch, document)
    _overrides(storage, user_id)
    try:
        response = await _post(**request_parts)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == http_status, response.text
    assert response.json()["detail"]["error"] == code
    assert storage.objects == {} and document.components == {}


@pytest.mark.asyncio
async def test_import_route_requires_authentication():
    response = await _post(**_multipart(1))

    assert response.status_code == 401
