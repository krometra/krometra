import re

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api import deps
from app.api.routes import api_keys as api_key_routes
from app.api.routes import auth as auth_routes
from app.config import get_settings
from app.core import rate_limit
from app.core.security import API_KEY_CLAIM, API_KEY_PREFIX, create_access_token, decode_access_token, hash_api_key
from app.models.api_key import ApiKey
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import auth_service
from app.services.api_key_service import ApiKeyError, create_api_key, delete_api_key
from tests.fakes import FakeDb, FakeRedis

KEY_LIMIT = get_settings().MAX_API_KEYS_PER_USER

pytestmark = pytest.mark.asyncio


def _add_user(db: FakeDb, email: str) -> User:
    user = User(email=email, password_hash=None, display_name=email)
    db.add(user)
    return user


@pytest.fixture
def db():
    return FakeDb()


@pytest.fixture
def redis():
    return FakeRedis()


@pytest.fixture
def alice(db):
    return _add_user(db, "alice@example.com")


@pytest.fixture
def bob(db):
    return _add_user(db, "bob@example.com")


@pytest.fixture
def client(db, redis):
    application = FastAPI()
    application.include_router(auth_routes.router, prefix="/api")
    application.include_router(api_key_routes.router, prefix="/api")

    async def override_db():
        yield db

    async def override_redis():
        yield redis

    application.dependency_overrides[deps.get_db] = override_db
    application.dependency_overrides[deps.get_redis] = override_redis
    return AsyncClient(transport=ASGITransport(app=application, client=("198.51.100.7", 1234)), base_url="http://test")


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _password_session(user: User) -> dict:
    return _bearer(create_access_token(user.id, user.email, api_key_id=None))


def _refresh_cookie(response) -> str:
    return re.search(r"refresh_token=([^;]+)", response.headers["set-cookie"]).group(1)


async def _create_key(client, user: User, name: str = "Claude Code") -> dict:
    response = await client.post("/api/auth/api-keys/", json={"name": name}, headers=_password_session(user))
    assert response.status_code == 201, response.text
    return response.json()


def _key_grant(client, key: str):
    return client.post("/api/auth/token", data={"grant_type": "api_key", "api_key": key})


def _refresh(client, cookie: str):
    return client.post("/api/auth/refresh", headers={"Cookie": f"refresh_token={cookie}"})


def _active_refresh_rows(db: FakeDb) -> list[RefreshToken]:
    return [row for row in db.rows(RefreshToken) if not row.revoked]


class TestApiKeyService:
    async def test_key_is_returned_once_and_only_its_hash_is_stored(self, db, alice):
        api_key, raw_key = await create_api_key(db, alice.id, "Claude Code")
        assert raw_key.startswith(API_KEY_PREFIX)
        assert len(raw_key) > len(API_KEY_PREFIX) + 40
        assert api_key.key_hash == hash_api_key(raw_key)
        assert api_key.prefix == raw_key[:12]
        stored = [str(getattr(api_key, column.key)) for column in ApiKey.__table__.columns]
        assert raw_key not in stored

    async def test_keys_are_unique(self, db, alice):
        raw_keys = {(await create_api_key(db, alice.id, f"key {i}"))[1] for i in range(5)}
        assert len(raw_keys) == 5

    async def test_limit_per_user(self, db, alice, bob):
        for i in range(KEY_LIMIT):
            await create_api_key(db, alice.id, f"key {i}")
        with pytest.raises(ApiKeyError) as exc:
            await create_api_key(db, alice.id, "one too many")
        assert (exc.value.status_code, exc.value.error) == (409, "api_key_limit")
        await create_api_key(db, bob.id, "bob's own")

    async def test_foreign_key_is_not_deleted(self, db, redis, alice, bob):
        api_key, _ = await create_api_key(db, alice.id, "alice")
        with pytest.raises(ApiKeyError) as exc:
            await delete_api_key(db, redis, bob.id, api_key.id)
        assert (exc.value.status_code, exc.value.error) == (404, "api_key_not_found")
        assert db.rows(ApiKey) == [api_key]

    async def test_delete_ends_key_sessions_only(self, db, redis, alice):
        api_key, raw_key = await create_api_key(db, alice.id, "alice")
        await auth_service.authenticate_api_key_grant(db, redis, raw_key, "203.0.113.1")
        await auth_service._start_refresh_family(db, redis, alice.id, api_key_id=None)
        key_family, password_family = (row.family_id for row in db.rows(RefreshToken))

        await delete_api_key(db, redis, alice.id, api_key.id)

        assert db.rows(ApiKey) == []
        assert [row.family_id for row in db.rows(RefreshToken)] == [password_family]
        assert await redis.get(f"refresh_family:{key_family}") is None
        assert await redis.get(f"refresh_family:{password_family}") is not None


class TestApiKeyGrant:
    async def test_grant_issues_session_bound_to_key(self, client, db, alice):
        created = await _create_key(client, alice)
        response = await _key_grant(client, created["key"])
        assert response.status_code == 200, response.text
        assert "refresh_token" not in response.json()
        assert decode_access_token(response.json()["access_token"])[API_KEY_CLAIM] == created["id"]
        assert [row.api_key_id for row in db.rows(RefreshToken)] == [created["id"]]
        assert db.rows(ApiKey)[0].last_used_at is not None

        me = await client.get("/api/auth/me", headers=_bearer(response.json()["access_token"]))
        assert me.status_code == 200
        assert me.json()["email"] == alice.email

    async def test_password_session_has_no_key_claim(self, db, redis, alice, monkeypatch):
        async def ok_user(_db, _email, _password):
            return alice

        monkeypatch.setattr(auth_service, "_check_credentials", ok_user)
        access_token, _ = await auth_service.authenticate_password_grant(db, redis, alice.email, "pw", "203.0.113.1")
        assert API_KEY_CLAIM not in decode_access_token(access_token)
        assert db.rows(RefreshToken)[0].api_key_id is None

    async def test_unknown_key_is_invalid_grant(self, client, alice):
        await _create_key(client, alice)
        response = await _key_grant(client, f"{API_KEY_PREFIX}not-a-real-key")
        assert response.status_code == 400
        assert response.json()["detail"]["error"] == "invalid_grant"

    async def test_missing_key_is_invalid_request(self, client):
        response = await client.post("/api/auth/token", data={"grant_type": "api_key"})
        assert response.status_code == 400
        assert response.json()["detail"]["error"] == "invalid_request"

    async def test_failures_share_ip_limit_with_password_logins(self, client, monkeypatch):
        async def no_user(_db, _email, _password):
            return None

        monkeypatch.setattr(auth_service, "_check_credentials", no_user)
        for _ in range(rate_limit.LOGIN_FAILURES_BY_IP.limit):
            assert (await _key_grant(client, f"{API_KEY_PREFIX}guess")).status_code == 400
        assert (await _key_grant(client, f"{API_KEY_PREFIX}guess")).status_code == 429
        password_attempt = await client.post(
            "/api/auth/token", data={"grant_type": "password", "username": "a@example.com", "password": "pw"}
        )
        assert password_attempt.status_code == 429


class TestKeySessionRotation:
    @pytest.mark.parametrize("via_token_endpoint", [False, True])
    async def test_rotation_keeps_key_binding(self, client, db, alice, via_token_endpoint):
        created = await _create_key(client, alice)
        cookie = _refresh_cookie(await _key_grant(client, created["key"]))

        for _ in range(3):
            if via_token_endpoint:
                response = await client.post(
                    "/api/auth/token",
                    data={"grant_type": "refresh_token"},
                    headers={"Cookie": f"refresh_token={cookie}"},
                )
            else:
                response = await _refresh(client, cookie)
            assert response.status_code == 200, response.text
            assert decode_access_token(response.json()["access_token"])[API_KEY_CLAIM] == created["id"]
            cookie = _refresh_cookie(response)

        assert [row.api_key_id for row in _active_refresh_rows(db)] == [created["id"]]

    async def test_revoking_key_breaks_access_and_refresh_at_once(self, client, alice):
        created = await _create_key(client, alice)
        grant = await _key_grant(client, created["key"])
        key_access = grant.json()["access_token"]
        cookie = _refresh_cookie(grant)

        deleted = await client.delete(f"/api/auth/api-keys/{created['id']}", headers=_password_session(alice))
        assert deleted.status_code == 204

        me = await client.get("/api/auth/me", headers=_bearer(key_access))
        assert me.status_code == 401
        assert me.json()["detail"]["error"] == "invalid_token"
        refreshed = await _refresh(client, cookie)
        assert refreshed.status_code == 400
        assert refreshed.json()["detail"]["error"] == "invalid_grant"
        assert (await _key_grant(client, created["key"])).status_code == 400
        assert (await client.get("/api/auth/me", headers=_password_session(alice))).status_code == 200

    async def test_claim_with_foreign_key_is_rejected(self, client, alice, bob):
        created = await _create_key(client, alice)
        forged = create_access_token(bob.id, bob.email, api_key_id=created["id"])
        response = await client.get("/api/auth/me", headers=_bearer(forged))
        assert response.status_code == 401


class TestApiKeyRoutes:
    async def test_created_key_is_shown_once(self, client, alice):
        created = await _create_key(client, alice, "  Claude Code  ")
        assert created["name"] == "Claude Code"
        assert created["key"].startswith(created["prefix"])
        assert created["last_used_at"] is None

        listed = await client.get("/api/auth/api-keys/", headers=_password_session(alice))
        assert listed.status_code == 200
        [entry] = listed.json()["api_keys"]
        assert set(entry) == {"id", "name", "prefix", "created_at", "last_used_at"}
        assert entry["id"] == created["id"]

    async def test_list_shows_only_own_keys(self, client, alice, bob):
        own = await _create_key(client, alice, "alice")
        await _create_key(client, bob, "bob")
        listed = await client.get("/api/auth/api-keys/", headers=_password_session(alice))
        assert [entry["id"] for entry in listed.json()["api_keys"]] == [own["id"]]

    async def test_foreign_key_delete_is_not_found(self, client, db, alice, bob):
        created = await _create_key(client, alice)
        response = await client.delete(f"/api/auth/api-keys/{created['id']}", headers=_password_session(bob))
        assert response.status_code == 404
        assert response.json()["detail"]["error"] == "api_key_not_found"
        assert len(db.rows(ApiKey)) == 1

    async def test_missing_key_delete_is_not_found(self, client, alice):
        response = await client.delete("/api/auth/api-keys/missing", headers=_password_session(alice))
        assert response.status_code == 404

    async def test_limit(self, client, alice):
        for i in range(KEY_LIMIT):
            await _create_key(client, alice, f"key {i}")
        response = await client.post("/api/auth/api-keys/", json={"name": "extra"}, headers=_password_session(alice))
        assert response.status_code == 409
        assert response.json()["detail"]["error"] == "api_key_limit"

    async def test_blank_name_is_rejected(self, client, alice):
        response = await client.post("/api/auth/api-keys/", json={"name": "   "}, headers=_password_session(alice))
        assert response.status_code == 422

    async def test_requires_authentication(self, client):
        assert (await client.get("/api/auth/api-keys/")).status_code == 401

    async def test_key_session_cannot_manage_keys(self, client, db, alice):
        created = await _create_key(client, alice)
        key_session = _bearer((await _key_grant(client, created["key"])).json()["access_token"])

        responses = [
            await client.get("/api/auth/api-keys/", headers=key_session),
            await client.post("/api/auth/api-keys/", json={"name": "escalation"}, headers=key_session),
            await client.delete(f"/api/auth/api-keys/{created['id']}", headers=key_session),
        ]

        for response in responses:
            assert response.status_code == 403
            assert response.json()["detail"]["error"] == "api_key_session_forbidden"
        assert [key.id for key in db.rows(ApiKey)] == [created["id"]]
