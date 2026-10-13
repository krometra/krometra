import json
import time
from types import SimpleNamespace

import pytest
from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.browser_upload_route import BrowserUploadRoute, body_limited_route
from app.core.storage import AsyncStorageClient
from app.schemas.document import DocumentUpdate
from app.services import document_service, project_service, storage_quota
from app.services.geometry_ops import browser_extrude
from app.services.geometry_ops.browser_extrude import _validated_browser_mesh, load_browser_step, save_browser_extrude
from app.services.geometry_ops.browser_rebuild import (
    RebuiltBody,
    parse_rebuild_json,
    save_browser_rebuild,
    validated_rebuild_body_ids,
)
from app.services.geometry_ops.common import browser_naming_key, browser_step_key, mesh_key
from app.services.geometry_ops.limits import MAX_REBUILD_BODIES, MAX_STEP_BYTES
from app.services.geometry_ops.mesh import get_mesh
from app.services.project_service import ProjectError, create_project, delete_project
from app.schemas.project import ProjectCreate

BODY_A = "body-aaaaaaaaaaaa"


def _mesh(faces: int = 1) -> dict:
    return {
        "vertices": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        "indices": [0, 1, 2] * faces,
        "brep_topo": {"faces": [{"face_id": index, "edges": []} for index in range(faces)], "edges": []},
        "bbox": {"min": [0.0, 0.0, 0.0], "max": [1.0, 1.0, 0.0]},
        "face_triangle_map": list(range(faces)),
    }


class _Storage:
    def __init__(self, objects: dict[str, bytes] | None = None):
        self.objects: dict[str, bytes] = dict(objects or {})
        self.deleted_prefixes: list[str] = []

    async def get_object(self, key: str) -> bytes | None:
        return self.objects.get(key)

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data

    async def delete_object(self, key: str) -> None:
        self.objects.pop(key, None)

    async def delete_prefix(self, prefix: str) -> None:
        self.deleted_prefixes.append(prefix)
        self.objects = {key: value for key, value in self.objects.items() if not key.startswith(prefix)}


class _Scalar:
    def __init__(self, value):
        self.value = value

    def scalar_one(self):
        return self.value


class _Db:
    def __init__(self, value=0):
        self.value = value
        self.deleted = []
        self.added = []

    async def execute(self, _statement):
        return _Scalar(self.value)

    async def delete(self, obj):
        self.deleted.append(obj)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        return None

    async def flush(self):
        return None

    async def refresh(self, _obj):
        return None


def _document():
    return SimpleNamespace(
        version=3,
        components={
            "sketch-1": {"plane": "XY", "entities": [], "constraints": []},
            BODY_A: {"type": "body", "source": {"kind": "browser_extrude"}, "visible": True},
        },
        timeline=[{"id": "e1", "kind": "extrude", "body_id": BODY_A, "params": {"distance": 5, "engine": "browser_wasm"}}],
    )


def _patch_documents(monkeypatch, document, save_document, *modules):
    async def get_document(*_args):
        return document

    for module in modules:
        monkeypatch.setattr(f"app.services.geometry_ops.{module}.get_document", get_document)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.save_document", save_document)


async def _conflict(*_args):
    raise HTTPException(status_code=409, detail={"error": "version_conflict", "error_description": "conflict"})


def test_large_mesh_face_lookup_is_linear():
    started = time.perf_counter()
    _validated_browser_mesh(json.dumps(_mesh(30_000)))
    assert time.perf_counter() - started < 2


@pytest.mark.parametrize("limit", ["MAX_MESH_FACES", "MAX_MESH_TRIANGLES", "MAX_MESH_VERTICES"])
def test_mesh_over_complexity_limit_is_rejected(monkeypatch, limit):
    monkeypatch.setattr(browser_extrude, limit, 0)
    with pytest.raises(HTTPException) as error:
        _validated_browser_mesh(json.dumps(_mesh()))
    assert error.value.status_code == 413
    assert error.value.detail["error"] == "browser_mesh_too_complex"


@pytest.mark.parametrize("key", [mesh_key, browser_step_key, browser_naming_key])
@pytest.mark.parametrize("body_id", ["../victim/geometry/body-aaaaaaaaaaaa", "body-a", "", "body-AAAAAAAAAAAA"])
def test_storage_keys_reject_foreign_body_ids(key, body_id):
    with pytest.raises(HTTPException) as error:
        key("project", body_id)
    assert error.value.detail["error"] == "invalid_body_id"


def test_storage_keys_accept_generated_body_id():
    assert mesh_key("p", BODY_A) == f"p/geometry/{BODY_A}.mesh"


@pytest.mark.asyncio
async def test_mesh_and_step_reads_hide_invalid_body_ids(monkeypatch):
    async def owned(*_args):
        return None

    monkeypatch.setattr("app.services.geometry_ops.mesh._require_project", owned)
    monkeypatch.setattr("app.services.geometry_ops.browser_extrude.get_document", lambda *_: _async(_document()))
    storage = _Storage({"x/../y.step": b"secret"})
    for call in (get_mesh, load_browser_step):
        with pytest.raises(HTTPException) as error:
            await call("p", "../y", "u", None, storage)
        assert error.value.status_code == 404


async def _async(value):
    return value


@pytest.mark.parametrize("components", [
    {"../evil": {"type": "sketch"}},
    {"a" * 65: {"type": "sketch"}},
    {"sketch-1": "not an object"},
    {"sketch-1": {"type": "body"}},
    {BODY_A: {"type": "body", "source": {"target_body_id": "../x"}}},
])
def test_document_update_rejects_unsafe_components(components):
    with pytest.raises(ValidationError):
        DocumentUpdate(components=components, version=1)


@pytest.mark.parametrize("entry", [
    {"id": "tl-1", "kind": "extrude", "body_id": "../victim/geometry/body-aaaaaaaaaaaa"},
    {"id": "tl-1", "kind": "boolean", "tool_body_id": "body-1"},
    {"id": "tl-1", "kind": "fillet", "params": {"target_body_id": "x/y"}},
    {"id": "../tl", "kind": "sketch"},
    {"id": "tl-1", "kind": "sketch", "sketch_id": "a/b"},
    {"id": "tl-1", "kind": "extrude", "params": "nope"},
    "entry",
])
def test_document_update_rejects_unsafe_timeline(entry):
    with pytest.raises(ValidationError):
        DocumentUpdate(timeline=[entry], version=1)


def test_document_update_accepts_real_document_shape():
    update = DocumentUpdate(
        components={
            "sketch-1718000000000": {"type": "sketch", "entities": []},
            "sk-base": {"type": "sketch"},
            BODY_A: {"type": "body", "source": {"kind": "browser_extrude", "sketch_id": "sk-base", "feature_key": "k-0123abcd"}},
        },
        timeline=[
            {"id": "tl-e2e-undo", "kind": "sketch", "sketch_id": "sk-base", "params": {}},
            {"id": "tl-0123456789ab", "kind": "extrude", "body_id": BODY_A, "params": {"target_body_id": None, "face_id": "11543"}},
        ],
        version=1,
    )
    assert BODY_A in update.components


def test_document_size_is_limited(monkeypatch):
    monkeypatch.setattr(document_service, "MAX_DOCUMENT_BYTES", 100)
    with pytest.raises(HTTPException) as error:
        document_service.ensure_document_size({"components": {"sketch-1": {"entities": ["x" * 200]}}})
    assert error.value.status_code == 413


def _limited_client(max_bytes: int) -> TestClient:
    router = APIRouter(route_class=body_limited_route(max_bytes))

    @router.put("/doc")
    async def put_doc(payload: dict):
        return {"keys": len(payload)}

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_body_limited_route_rejects_declared_oversize():
    response = _limited_client(100).put("/doc", content=json.dumps({"x": "y" * 200}), headers={"content-type": "application/json"})
    assert response.status_code == 413
    assert response.json()["detail"]["error"] == "request_too_large"


def test_body_limited_route_rejects_streamed_oversize():
    def chunks():
        yield b'{"x": "'
        yield b"y" * 200
        yield b'"}'

    response = _limited_client(100).put("/doc", content=chunks(), headers={"content-type": "application/json"})
    assert response.status_code == 413


def test_body_limited_route_accepts_small_body():
    response = _limited_client(100).put("/doc", json={"a": 1})
    assert response.status_code == 200


def _upload_client() -> TestClient:
    router = APIRouter(route_class=BrowserUploadRoute)

    @router.post("/upload")
    async def upload(step: UploadFile = File(...), mesh: str = Form(...)):
        data = await step.read(MAX_STEP_BYTES + 1)
        return {"step": len(data), "mesh": len(mesh)}

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_browser_upload_rejects_too_many_fields():
    data = {f"field{index}": "x" for index in range(40)}
    response = _upload_client().post("/upload", data={**data, "mesh": "{}"}, files={"step": ("a.step", b"S")})
    assert response.status_code == 400


def test_browser_upload_rejects_extra_files():
    files = {"step": ("a.step", b"S"), "other": ("b.step", b"S")}
    response = _upload_client().post("/upload", data={"mesh": "{}"}, files=files)
    assert response.status_code == 400


def test_browser_upload_step_read_is_bounded():
    response = _upload_client().post("/upload", data={"mesh": "{}"}, files={"step": ("a.step", b"S" * (MAX_STEP_BYTES + 100))})
    assert response.json()["step"] == MAX_STEP_BYTES + 1


@pytest.mark.usefixtures("stub_quota")
@pytest.mark.asyncio
async def test_new_body_objects_are_removed_when_document_save_fails(monkeypatch):
    document = _document()
    _patch_documents(monkeypatch, document, _conflict, "browser_extrude")
    storage = _Storage()

    with pytest.raises(HTTPException) as error:
        await save_browser_extrude(
            project_id="p", user_id="u", sketch_id="sketch-1", distance=5, direction="one_side", document_version=3,
            step_bytes=b"ISO-10303-21;", mesh_json=json.dumps(_mesh()), db=None, storage=storage,
            naming={"version": 1, "faces": []},
        )

    assert error.value.status_code == 409
    assert storage.objects == {}


@pytest.mark.usefixtures("stub_quota")
@pytest.mark.asyncio
async def test_rebuilt_body_objects_are_restored_when_document_save_fails(monkeypatch):
    document = _document()
    _patch_documents(monkeypatch, document, _conflict, "browser_rebuild")
    original = {
        mesh_key("p", BODY_A): b"old-mesh",
        browser_step_key("p", BODY_A): b"old-step",
    }
    storage = _Storage(original)
    naming = json.dumps({"version": 1, "faces": []})

    with pytest.raises(HTTPException):
        await save_browser_rebuild(
            "p", "u", "e1", {"distance": 9}, [RebuiltBody(BODY_A, b"new-step", json.dumps(_mesh()), naming)], {}, 3, None, storage,
        )

    assert storage.objects == original


@pytest.mark.asyncio
async def test_rebuild_quota_counts_only_growth(monkeypatch):
    document = _document()
    saved = []

    async def save_document(_db, _project_id, _user_id, update):
        saved.append(update)
        return document

    _patch_documents(monkeypatch, document, save_document, "browser_rebuild")
    charged = []

    async def ensure_storage_quota(_db, _user_id, added):
        charged.append(added)

    async def refresh(*_args):
        return None

    monkeypatch.setattr("app.services.geometry_ops.browser_storage.ensure_storage_quota", ensure_storage_quota)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.refresh_project_usage", refresh)
    storage = _Storage({mesh_key("p", BODY_A): b"m" * 10_000, browser_step_key("p", BODY_A): b"s" * 10_000})

    await save_browser_rebuild("p", "u", "e1", {"distance": 9}, [RebuiltBody(BODY_A, b"step", json.dumps(_mesh()), None)], {}, 3, None, storage)

    assert charged and charged[0] < 0
    assert saved


@pytest.mark.asyncio
async def test_storage_quota_rejects_growth_past_limit():
    with pytest.raises(HTTPException) as error:
        await storage_quota.ensure_storage_quota(_Db(storage_quota.max_storage_bytes_per_user() - 10), "u", 11)
    assert error.value.status_code == 413
    assert error.value.detail["error"] == "storage_quota_exceeded"
    await storage_quota.ensure_storage_quota(_Db(storage_quota.max_storage_bytes_per_user() - 10), "u", 10)
    await storage_quota.ensure_storage_quota(_Db(storage_quota.max_storage_bytes_per_user() * 2), "u", -5)


@pytest.mark.asyncio
async def test_project_count_is_limited():
    with pytest.raises(ProjectError) as error:
        await create_project(_Db(storage_quota.max_projects_per_user()), "u", ProjectCreate(name="p"))
    assert error.value.status_code == 403
    db = _Db(storage_quota.max_projects_per_user() - 1)
    await create_project(db, "u", ProjectCreate(name="p"))
    assert len(db.added) == 2


@pytest.mark.asyncio
async def test_delete_project_removes_its_storage_prefix(monkeypatch):
    project = SimpleNamespace(id="p1")

    async def get_project(*_args):
        return project

    monkeypatch.setattr(project_service, "get_project", get_project)
    storage = _Storage({"p1/thumbnail.png": b"png", f"p1/geometry/{BODY_A}.mesh": b"m", "p10/thumbnail.png": b"keep"})
    db = _Db()

    await delete_project(db, "p1", "u", storage)

    assert db.deleted == [project]
    assert storage.deleted_prefixes == ["p1/"]
    assert storage.objects == {"p10/thumbnail.png": b"keep"}


def test_rebuild_body_ids_are_validated():
    assert validated_rebuild_body_ids([BODY_A]) == [BODY_A]
    with pytest.raises(HTTPException) as error:
        validated_rebuild_body_ids(["../x"])
    assert error.value.detail["error"] == "invalid_body_id"
    with pytest.raises(HTTPException) as error:
        validated_rebuild_body_ids([BODY_A] * (MAX_REBUILD_BODIES + 1))
    assert error.value.status_code == 413


def test_rebuild_params_json_size_is_limited():
    with pytest.raises(HTTPException) as error:
        parse_rebuild_json(json.dumps({"x": "y" * 70_000}), dict, "bad")
    assert error.value.status_code == 413


class _FakeMinio:
    def __init__(self, names: dict[str, int]):
        self.names = names
        self.removed: list[str] = []

    def list_objects(self, _bucket, prefix, recursive):
        return [SimpleNamespace(object_name=name, size=size) for name, size in self.names.items() if name.startswith(prefix)]

    def remove_objects(self, _bucket, objects):
        self.removed += [obj.name for obj in objects]
        return iter([])


@pytest.mark.asyncio
async def test_storage_client_prefix_operations():
    client = AsyncStorageClient("localhost:9", "a", "b", "bucket")
    client._client = _FakeMinio({"p1/a.mesh": 10, "p1/geometry/b.step": 5, "p10/c": 99})

    assert await client.prefix_size("p1/") == 15
    await client.delete_prefix("p1/")
    assert sorted(client._client.removed) == ["p1/a.mesh", "p1/geometry/b.step"]
    with pytest.raises(ValueError):
        await client.delete_prefix("p1")
