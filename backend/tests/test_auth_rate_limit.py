from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api import deps
from app.api.routes import auth as auth_routes
from app.core import rate_limit
from app.core.rate_limit import RateLimitExceeded, resolve_client_ip
from app.services.auth_service import AuthError

TRUSTED = "127.0.0.1/32,10.0.0.0/8,172.16.0.0/12"


class TestClientIp:
    def test_untrusted_peer_ignores_forwarded_headers(self):
        headers = {"x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4"}
        assert resolve_client_ip("203.0.113.7", headers, TRUSTED) == "203.0.113.7"

    def test_trusted_proxy_uses_rightmost_untrusted_hop(self):
        headers = {"x-forwarded-for": "6.6.6.6, 198.51.100.9, 172.18.0.5"}
        assert resolve_client_ip("172.18.0.2", headers, TRUSTED) == "198.51.100.9"

    def test_trusted_proxy_falls_back_to_real_ip(self):
        assert resolve_client_ip("172.18.0.2", {"x-real-ip": "198.51.100.9"}, TRUSTED) == "198.51.100.9"

    def test_trusted_proxy_without_headers_is_the_client(self):
        assert resolve_client_ip("127.0.0.1", {}, TRUSTED) == "127.0.0.1"

    def test_empty_trust_list_trusts_nobody(self):
        assert resolve_client_ip("127.0.0.1", {"x-forwarded-for": "1.2.3.4"}, "") == "127.0.0.1"

    def test_missing_peer(self):
        assert resolve_client_ip(None, {}, TRUSTED) == "unknown"


class TestCounters:
    pytestmark = pytest.mark.asyncio

    LIMIT = rate_limit.Limit("rl:test", 3, 60, "Слишком часто")

    async def test_consume_allows_up_to_limit(self, redis_client):
        for _ in range(3):
            await rate_limit.consume(redis_client, self.LIMIT, "x")
        with pytest.raises(RateLimitExceeded) as exc:
            await rate_limit.consume(redis_client, self.LIMIT, "x")
        assert 1 <= exc.value.retry_after <= 60
        assert "Повторите через" in exc.value.description

    async def test_subjects_are_independent(self, redis_client):
        for _ in range(3):
            await rate_limit.consume(redis_client, self.LIMIT, "a")
        await rate_limit.consume(redis_client, self.LIMIT, "b")

    async def test_ensure_available_does_not_count(self, redis_client):
        for _ in range(5):
            await rate_limit.ensure_available(redis_client, self.LIMIT, "x")
        assert await redis_client.get("rl:test:x") is None

    async def test_ensure_available_blocks_at_limit_and_reset_clears(self, redis_client):
        for _ in range(3):
            await rate_limit.consume(redis_client, self.LIMIT, "x")
        with pytest.raises(RateLimitExceeded):
            await rate_limit.ensure_available(redis_client, self.LIMIT, "x")
        await rate_limit.reset(redis_client, self.LIMIT, "x")
        await rate_limit.ensure_available(redis_client, self.LIMIT, "x")


@pytest.fixture
def app(redis_client):
    application = FastAPI()
    application.include_router(auth_routes.router, prefix="/api")

    async def override_redis():
        yield redis_client

    async def override_db():
        yield None

    application.dependency_overrides[deps.get_redis] = override_redis
    application.dependency_overrides[deps.get_db] = override_db
    return application


@pytest.fixture
def wrong_password(monkeypatch):
    from app.services import auth_service

    async def no_user(db, email, password):
        return None

    monkeypatch.setattr(auth_service, "_check_credentials", no_user)


@pytest.fixture
def client(app):
    return AsyncClient(transport=ASGITransport(app=app, client=("198.51.100.1", 1234)), base_url="http://test")


class _CollectingDb:
    def add(self, _row):
        pass

    async def commit(self):
        pass


async def _collecting_db():
    yield _CollectingDb()


def _login(client, email, password="wrong-password"):
    return client.post("/api/auth/token", data={"grant_type": "password", "username": email, "password": password})


@pytest.mark.asyncio
class TestLoginRoute:
    async def test_email_locked_after_failures(self, client, wrong_password):
        for _ in range(rate_limit.LOGIN_FAILURES_BY_EMAIL.limit):
            resp = await _login(client, "Victim@Example.com ")
            assert resp.status_code == 400
        resp = await _login(client, "victim@example.com")
        assert resp.status_code == 429
        assert int(resp.headers["Retry-After"]) > 0
        assert resp.json()["detail"]["error"] == "rate_limited"
        assert "неудачных попыток" in resp.json()["detail"]["error_description"]

    async def test_ip_limited_across_emails(self, client, wrong_password):
        for i in range(rate_limit.LOGIN_FAILURES_BY_IP.limit):
            assert (await _login(client, f"user{i}@example.com")).status_code == 400
        resp = await _login(client, "fresh@example.com")
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers

    async def test_successful_logins_are_not_limited(self, app, client, monkeypatch):
        from app.services import auth_service

        async def ok_user(db, email, password):
            return SimpleNamespace(id="u1", email=email, is_admin=False)

        monkeypatch.setattr(auth_service, "_check_credentials", ok_user)
        app.dependency_overrides[deps.get_db] = _collecting_db
        for _ in range(rate_limit.LOGIN_FAILURES_BY_IP.limit + 5):
            resp = await _login(client, "user@example.com", "right-pass")
            assert resp.status_code == 200
            assert "refresh_token" not in resp.json()
            assert "refresh_token=" in resp.headers["set-cookie"]

    async def test_refresh_grant_requires_cookie_not_form(self, client):
        resp = await client.post("/api/auth/token", data={"grant_type": "refresh_token", "refresh_token": "abc"})
        assert resp.status_code == 400
        assert resp.json()["detail"]["error"] == "invalid_request"

    async def test_refresh_endpoint_rate_limited(self, client, monkeypatch):
        async def invalid_refresh(db, redis, raw):
            raise AuthError("invalid_grant", "Invalid or expired refresh token.")

        monkeypatch.setattr(auth_routes, "refresh_access_token", invalid_refresh)
        client.cookies.set("refresh_token", "whatever")
        for _ in range(rate_limit.REFRESH_BY_IP.limit):
            assert (await client.post("/api/auth/refresh")).status_code == 400
        assert (await client.post("/api/auth/refresh")).status_code == 429

    async def test_register_rate_limited(self, client, monkeypatch):
        async def taken(db, data):
            raise AuthError("email_taken", "A user with this email already exists.")

        monkeypatch.setattr(auth_routes, "register_user", taken)
        body = {"email": "a@example.com", "password": "long-enough-pass", "personal_data_consent": True}
        for _ in range(rate_limit.REGISTER_BY_IP.limit):
            assert (await client.post("/api/auth/register", json=body)).status_code == 409
        assert (await client.post("/api/auth/register", json=body)).status_code == 429
