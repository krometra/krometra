import pytest

from app.services import thumbnail_service
from app.services.project_service import ProjectError
from app.services.thumbnail_service import (
    MAX_THUMBNAIL_BYTES,
    PNG_SIGNATURE,
    delete_thumbnail,
    load_thumbnail,
    save_thumbnail,
    validated_thumbnail,
)


class _Storage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    async def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data

    async def get_object(self, key: str) -> bytes | None:
        return self.objects.get(key)

    async def object_exists(self, key: str) -> bool:
        return key in self.objects

    async def delete_object(self, key: str) -> None:
        self.objects.pop(key, None)


@pytest.fixture
def owned_project(monkeypatch):
    async def get_project(_db, project_id, user_id):
        if user_id != "owner":
            raise ProjectError(404, "Project not found.")
        return object()

    monkeypatch.setattr(thumbnail_service, "get_project", get_project)

    async def skip(*_args):
        return None

    monkeypatch.setattr(thumbnail_service, "ensure_storage_quota", skip)
    monkeypatch.setattr(thumbnail_service, "refresh_project_usage", skip)


def test_validated_thumbnail_accepts_png():
    png = PNG_SIGNATURE + b"data"
    assert validated_thumbnail(png) == png


@pytest.mark.parametrize(("payload", "code"), [
    (b"GIF89a", 400),
    (b"", 400),
    (PNG_SIGNATURE + b"x" * MAX_THUMBNAIL_BYTES, 413),
])
def test_validated_thumbnail_rejects_foreign_or_large_files(payload, code):
    with pytest.raises(ProjectError) as error:
        validated_thumbnail(payload)
    assert error.value.status_code == code


@pytest.mark.asyncio
async def test_thumbnail_round_trip(owned_project):
    storage = _Storage()
    png = PNG_SIGNATURE + b"image"

    assert await load_thumbnail(None, "p1", "owner", storage) is None
    await save_thumbnail(None, "p1", "owner", png, storage)
    assert await load_thumbnail(None, "p1", "owner", storage) == png
    await delete_thumbnail(None, "p1", "owner", storage)
    assert await load_thumbnail(None, "p1", "owner", storage) is None


@pytest.mark.asyncio
async def test_thumbnail_is_isolated_by_owner(owned_project):
    storage = _Storage()
    with pytest.raises(ProjectError) as error:
        await save_thumbnail(None, "p1", "stranger", PNG_SIGNATURE, storage)
    assert error.value.status_code == 404
    assert storage.objects == {}
