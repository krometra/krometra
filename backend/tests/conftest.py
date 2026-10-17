"""Shared fixtures for integration tests.

Usage: pytest tests/ -v -m "integration"

Requires:
  - Running backend (and DB + MinIO)
  - A registered user (TEST_USER_EMAIL / TEST_USER_PASSWORD in env or defaults)

To register a test user:
  curl -X POST http://localhost:8000/api/auth/register \\
    -H "Content-Type: application/json" \\
    -d '{"email":"test@example.com","password":"testpass123","display_name":"Test"}'
"""

import os
import time

os.environ.setdefault("DEBUG", "true")

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport


@pytest.fixture(scope="session")
def test_user_email():
    return os.getenv("TEST_USER_EMAIL", "test@example.com")


@pytest.fixture(scope="session")
def test_user_password():
    return os.getenv("TEST_USER_PASSWORD", "testpass123")


@pytest_asyncio.fixture
async def async_client():
    """Async HTTP client pointed at the local backend."""
    # Use ASGI transport when testing directly; swap to base URL for running server
    base_url = os.getenv("TEST_BASE_URL", "http://localhost:8000")
    # trust_env=False: локальный http_proxy/ALL_PROXY не должен перехватывать localhost
    async with AsyncClient(base_url=base_url, trust_env=False) as client:
        yield client


@pytest_asyncio.fixture
async def auth_headers(async_client, test_user_email, test_user_password):
    """Get Authorization header for a registered test user."""
    # Login to get tokens
    resp = await async_client.post(
        "/api/auth/login",
        data={
            "username": test_user_email,
            "password": test_user_password,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code != 200:
        pytest.skip(
            f"Test user '{test_user_email}' not registered or login failed "
            f"(status {resp.status_code}). Register it first."
        )

    tokens = resp.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


@pytest_asyncio.fixture
async def fresh_auth_headers(async_client):
    """Register a throwaway user so tests do not depend on stale accounts."""
    email = f"test-fresh-{int(time.time() * 1000)}@example.com"
    password = "fresh-test-pass-123"
    resp = await async_client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": "Fresh Test"},
    )
    if resp.status_code != 201:
        pytest.skip(f"Cannot register test user (status {resp.status_code}) — is the backend running?")

    resp = await async_client.post(
        "/api/auth/token",
        data={"grant_type": "password", "username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest_asyncio.fixture
async def second_auth_headers(async_client):
    """Второй одноразовый пользователь — для проверок изоляции между владельцами."""
    email = f"test-other-{int(time.time() * 1000)}@example.com"
    password = "other-test-pass-123"
    resp = await async_client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": "Other Test"},
    )
    if resp.status_code != 201:
        pytest.skip(f"Cannot register test user (status {resp.status_code}) — is the backend running?")

    resp = await async_client.post(
        "/api/auth/token",
        data={"grant_type": "password", "username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest_asyncio.fixture
async def test_project_id(async_client, auth_headers):
    """Get or create a test project ID."""
    # Try to list projects
    resp = await async_client.get("/api/projects", headers=auth_headers)
    if resp.status_code != 200:
        pytest.skip("Cannot list projects — is the backend running?")

    projects = resp.json().get("projects", [])
    if projects:
        return projects[0]["id"]

    # Create a test project
    create_resp = await async_client.post(
        "/api/projects",
        json={"name": "_test_boolean"},
        headers=auth_headers,
    )
    if create_resp.status_code != 200:
        pytest.skip("Cannot create test project")

    return create_resp.json()["id"]


@pytest_asyncio.fixture
async def redis_client():
    """Настоящий Redis для Lua-скриптов: TEST_REDIS_URL обязателен в CI, локально — пропуск без Redis."""
    import redis.asyncio as aioredis
    from redis.exceptions import ConnectionError as RedisConnectionError

    url = os.getenv("TEST_REDIS_URL")
    client = aioredis.from_url(url or "redis://localhost:6379/15", decode_responses=True)
    try:
        await client.ping()
    except RedisConnectionError:
        await client.aclose()
        if url:
            raise
        pytest.skip("Redis недоступен (задай TEST_REDIS_URL)")
    await client.flushdb()
    yield client
    await client.flushdb()
    await client.aclose()


@pytest_asyncio.fixture
async def pg_sessions():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.models import Base

    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Postgres недоступен (задай TEST_DATABASE_URL)")
    engine = create_async_engine(url, poolclass=NullPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
def stub_quota(monkeypatch):
    """Юнит-тесты browser-операций идут без БД: квоту и учёт объёма подменяем."""

    async def skip(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.services.geometry_ops.browser_storage.ensure_storage_quota", skip)
    monkeypatch.setattr("app.services.geometry_ops.browser_storage.refresh_project_usage", skip)
