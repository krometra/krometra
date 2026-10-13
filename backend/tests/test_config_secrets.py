import pytest
from pydantic import ValidationError

from app.config import Settings

SAFE = {
    "JWT_SECRET": "a" * 64,
    "MINIO_ACCESS_KEY": "cadstudio-0123456789ab",
    "MINIO_SECRET_KEY": "b" * 48,
    "DATABASE_URL": "postgresql+asyncpg://cadstudio:c0ffee@postgres:5432/cadstudio",
}


def test_debug_allows_default_secrets():
    assert Settings(_env_file=None, DEBUG=True).DEBUG


def test_production_accepts_custom_secrets():
    assert not Settings(_env_file=None, DEBUG=False, **SAFE).DEBUG


@pytest.mark.parametrize("field,value", [
    ("JWT_SECRET", "change-me-in-production-use-a-strong-random-secret-at-least-32-bytes"),
    ("JWT_SECRET", "a" * 31),
    ("MINIO_ACCESS_KEY", "minioadmin"),
    ("MINIO_SECRET_KEY", "minioadmin"),
    ("DATABASE_URL", "postgresql+asyncpg://cadstudio:cadstudio@postgres:5432/cadstudio"),
])
def test_production_rejects_default_secret(field, value):
    with pytest.raises(ValidationError, match=field):
        Settings(_env_file=None, DEBUG=False, **{**SAFE, field: value})
