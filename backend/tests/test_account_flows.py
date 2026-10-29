import re

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api import deps
from app.api.routes import account as account_routes
from app.api.routes import api_keys as api_key_routes
from app.api.routes import auth as auth_routes
from app.core import mailer, rate_limit, security
from app.core.security import create_access_token
from app.models.refresh_token import RefreshToken
from app.models.user import User
from tests.fakes import FakeDb, FakeRedis

pytestmark = pytest.mark.asyncio

PASSWORD = "first-pass-123"
NEW_PASSWORD = "second-pass-456"


@pytest.fixture(autouse=True)
def fast_bcrypt(monkeypatch):
    monkeypatch.setattr(security, "BCRYPT_ROUNDS", 4)


@pytest.fixture
def outbox(monkeypatch):
    sent: list[mailer.Email] = []

    async def capture(email):
        sent.append(email)

    monkeypatch.setattr(mailer, "send_email", capture)
    return sent


@pytest.fixture
def db():
    return FakeDb()


@pytest.fixture
def redis():
    return FakeRedis()


@pytest.fixture
def client(db, redis):
    application = FastAPI()
    for router in (auth_routes.router, account_routes.router, api_key_routes.router):
        application.include_router(router, prefix="/api")

    async def override_db():
        yield db

    async def override_redis():
        yield redis

    application.dependency_overrides[deps.get_db] = override_db
    application.dependency_overrides[deps.get_redis] = override_redis
    return AsyncClient(transport=ASGITransport(app=application, client=("198.51.100.7", 1234)), base_url="http://test")


def _token_from(email: mailer.Email) -> str:
    return re.search(r"token=([\w-]+)", email.text).group(1)


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _cookie(response) -> str:
    return re.search(r"refresh_token=([^;]+)", response.headers["set-cookie"]).group(1)


async def _register(client, email="alice@example.com") -> dict:
    response = await client.post("/api/auth/register", json={"email": email, "password": PASSWORD, "personal_data_consent": True})
    assert response.status_code == 201, response.text
    return response.json()["user"]


async def _login(client, email="alice@example.com", password=PASSWORD):
    return await client.post("/api/auth/token", data={"grant_type": "password", "username": email, "password": password})


async def _session(client, email="alice@example.com") -> tuple[dict, str]:
    response = await _login(client, email)
    assert response.status_code == 200, response.text
    return _bearer(response.json()["access_token"]), _cookie(response)


def _active_families(db: FakeDb) -> set[str]:
    return {row.family_id for row in db.rows(RefreshToken) if not row.revoked}


class TestVerification:
    async def test_register_sends_verification_and_user_is_unverified(self, client, outbox):
        user = await _register(client)
        assert user["email_verified"] is False
        [email] = outbox
        assert email.to == "alice@example.com"
        assert "/verify-email?token=" in email.text

    async def test_register_records_personal_data_consent(self, client, db, outbox):
        await _register(client)
        assert db.rows(User)[0].personal_data_consent_at is not None

    @pytest.mark.parametrize("consent", [None, False])
    async def test_register_without_personal_data_consent_is_rejected(self, client, db, outbox, consent):
        body = {"email": "alice@example.com", "password": PASSWORD}
        if consent is not None:
            body["personal_data_consent"] = consent
        response = await client.post("/api/auth/register", json=body)
        assert response.status_code == 422
        assert db.rows(User) == []
        assert outbox == []

    async def test_verify_without_auth_then_token_is_spent(self, client, db, outbox):
        await _register(client)
        token = _token_from(outbox[0])
        response = await client.post("/api/auth/verify-email", json={"token": token})
        assert (response.status_code, response.content) == (204, b"")
        assert db.rows(User)[0].email_verified
        again = await client.post("/api/auth/verify-email", json={"token": token})
        assert again.status_code == 400
        assert again.json()["detail"]["error"] == "invalid_token"

    async def test_unknown_token_is_invalid(self, client):
        response = await client.post("/api/auth/verify-email", json={"token": "nope"})
        assert response.status_code == 400
        assert response.json()["detail"]["error"] == "invalid_token"

    async def test_me_reports_verification(self, client, outbox):
        await _register(client)
        headers, _ = await _session(client)
        assert (await client.get("/api/auth/me", headers=headers)).json()["email_verified"] is False
        await client.post("/api/auth/verify-email", json={"token": _token_from(outbox[0])})
        assert (await client.get("/api/auth/me", headers=headers)).json()["email_verified"] is True

    async def test_resend_requires_auth(self, client):
        assert (await client.post("/api/auth/verify-email/resend")).status_code == 401

    async def test_resend_is_rate_limited(self, client, outbox):
        await _register(client)
        headers, _ = await _session(client)
        for _ in range(rate_limit.VERIFY_RESEND_BY_USER.limit):
            assert (await client.post("/api/auth/verify-email/resend", headers=headers)).status_code == 204
        assert (await client.post("/api/auth/verify-email/resend", headers=headers)).status_code == 429
        assert len(outbox) == 1 + rate_limit.VERIFY_RESEND_BY_USER.limit

    async def test_resend_for_verified_is_conflict(self, client, outbox):
        await _register(client)
        await client.post("/api/auth/verify-email", json={"token": _token_from(outbox[0])})
        headers, _ = await _session(client)
        response = await client.post("/api/auth/verify-email/resend", headers=headers)
        assert response.status_code == 409
        assert response.json()["detail"]["error"] == "email_already_verified"
        assert len(outbox) == 1

    async def test_registration_survives_smtp_failure(self, client, monkeypatch):
        async def broken(*_args, **_kwargs):
            raise OSError("smtp down")

        monkeypatch.setattr(mailer.settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(mailer.aiosmtplib, "send", broken)
        await _register(client)


class TestApiKeyNeedsVerifiedEmail:
    async def test_key_is_blocked_until_verified(self, client, outbox):
        await _register(client)
        headers, _ = await _session(client)
        blocked = await client.post("/api/auth/api-keys/", json={"name": "Claude"}, headers=headers)
        assert blocked.status_code == 403
        assert blocked.json()["detail"]["error"] == "email_not_verified"
        await client.post("/api/auth/verify-email", json={"token": _token_from(outbox[0])})
        allowed = await client.post("/api/auth/api-keys/", json={"name": "Claude"}, headers=headers)
        assert allowed.status_code == 201


class TestForgotPassword:
    async def test_does_not_reveal_users(self, client, outbox):
        await _register(client)
        outbox.clear()
        known = await client.post("/api/auth/password/forgot", json={"email": "Alice@Example.com"})
        unknown = await client.post("/api/auth/password/forgot", json={"email": "ghost@example.com"})
        assert (known.status_code, known.content) == (unknown.status_code, unknown.content) == (204, b"")
        assert [email.to for email in outbox] == ["alice@example.com"]
        assert "/reset-password?token=" in outbox[0].text

    async def test_email_limit_is_silent(self, client, outbox):
        await _register(client)
        outbox.clear()
        for _ in range(rate_limit.FORGOT_PASSWORD_BY_EMAIL.limit + 2):
            response = await client.post("/api/auth/password/forgot", json={"email": "alice@example.com"})
            assert response.status_code == 204
        assert len(outbox) == rate_limit.FORGOT_PASSWORD_BY_EMAIL.limit

    async def test_ip_limit(self, client):
        for i in range(rate_limit.FORGOT_PASSWORD_BY_IP.limit):
            await client.post("/api/auth/password/forgot", json={"email": f"u{i}@example.com"})
        response = await client.post("/api/auth/password/forgot", json={"email": "last@example.com"})
        assert response.status_code == 429


async def _reset_token(client, outbox, email="alice@example.com") -> str:
    outbox.clear()
    assert (await client.post("/api/auth/password/forgot", json={"email": email})).status_code == 204
    return _token_from(outbox[-1])


class TestResetPassword:
    async def test_reset_sets_password_and_revokes_sessions(self, client, db, redis, outbox):
        await _register(client)
        _, cookie = await _session(client)
        token = await _reset_token(client, outbox)
        outbox.clear()

        response = await client.post("/api/auth/password/reset", json={"token": token, "new_password": NEW_PASSWORD})
        assert response.status_code == 204

        assert _active_families(db) == set()
        assert not [key for key in redis.data if key.startswith("refresh_family:")]
        assert (await client.post("/api/auth/refresh", headers={"Cookie": f"refresh_token={cookie}"})).status_code == 400
        assert (await _login(client)).status_code == 400
        assert (await _login(client, password=NEW_PASSWORD)).status_code == 200
        assert db.rows(User)[0].email_verified
        assert [email.subject for email in outbox] == ["Пароль в Крометре изменён"]

    async def test_token_is_single_use(self, client, outbox):
        await _register(client)
        token = await _reset_token(client, outbox)
        body = {"token": token, "new_password": NEW_PASSWORD}
        assert (await client.post("/api/auth/password/reset", json=body)).status_code == 204
        again = await client.post("/api/auth/password/reset", json=body)
        assert again.status_code == 400
        assert again.json()["detail"]["error"] == "invalid_token"

    async def test_newer_request_invalidates_older_link(self, client, outbox):
        await _register(client)
        older = await _reset_token(client, outbox)
        newer = await _reset_token(client, outbox)
        stale = await client.post("/api/auth/password/reset", json={"token": older, "new_password": NEW_PASSWORD})
        assert stale.status_code == 400
        fresh = await client.post("/api/auth/password/reset", json={"token": newer, "new_password": NEW_PASSWORD})
        assert fresh.status_code == 204

    async def test_weak_password_keeps_token(self, client, outbox):
        await _register(client)
        token = await _reset_token(client, outbox)
        weak = await client.post("/api/auth/password/reset", json={"token": token, "new_password": "short"})
        assert weak.status_code == 422
        ok = await client.post("/api/auth/password/reset", json={"token": token, "new_password": NEW_PASSWORD})
        assert ok.status_code == 204

    async def test_oauth_only_account_gets_password(self, client, db, outbox):
        db.add(User(email="oauth@example.com", password_hash=None, display_name="OAuth"))
        token = await _reset_token(client, outbox, "oauth@example.com")
        response = await client.post("/api/auth/password/reset", json={"token": token, "new_password": NEW_PASSWORD})
        assert response.status_code == 204
        assert (await _login(client, "oauth@example.com", NEW_PASSWORD)).status_code == 200

    async def test_ip_limit(self, client):
        for _ in range(rate_limit.RESET_PASSWORD_BY_IP.limit):
            await client.post("/api/auth/password/reset", json={"token": "guess", "new_password": NEW_PASSWORD})
        response = await client.post("/api/auth/password/reset", json={"token": "guess", "new_password": NEW_PASSWORD})
        assert response.status_code == 429


def _change(client, headers, current=PASSWORD, new=NEW_PASSWORD, cookie=None):
    extra = {"Cookie": f"refresh_token={cookie}"} if cookie else {}
    return client.post(
        "/api/auth/password/change",
        json={"current_password": current, "new_password": new},
        headers={**headers, **extra},
    )


class TestChangePassword:
    async def test_requires_auth(self, client):
        response = await client.post("/api/auth/password/change", json={"current_password": "x", "new_password": NEW_PASSWORD})
        assert response.status_code == 401

    async def test_keeps_current_session_and_revokes_others(self, client, db, outbox):
        await _register(client)
        headers, current_cookie = await _session(client)
        _, other_cookie = await _session(client)
        current_family = next(row.family_id for row in db.rows(RefreshToken) if not row.revoked)
        outbox.clear()

        response = await _change(client, headers, cookie=current_cookie)
        assert response.status_code == 204

        assert _active_families(db) == {current_family}
        assert (await client.post("/api/auth/refresh", headers={"Cookie": f"refresh_token={current_cookie}"})).status_code == 200
        assert (await client.post("/api/auth/refresh", headers={"Cookie": f"refresh_token={other_cookie}"})).status_code == 400
        assert (await _login(client, password=NEW_PASSWORD)).status_code == 200
        assert [email.subject for email in outbox] == ["Пароль в Крометре изменён"]

    async def test_without_cookie_revokes_all_sessions(self, client, db):
        await _register(client)
        headers, _ = await _session(client)
        assert (await _change(client, headers)).status_code == 204
        assert _active_families(db) == set()

    async def test_wrong_current_password_is_rate_limited(self, client, outbox):
        await _register(client)
        headers, _ = await _session(client)
        outbox.clear()
        for _ in range(rate_limit.PASSWORD_CHANGE_FAILURES_BY_USER.limit):
            response = await _change(client, headers, current="wrong-pass")
            assert response.status_code == 400
            assert response.json()["detail"]["error"] == "invalid_current_password"
        assert (await _change(client, headers)).status_code == 429
        assert outbox == []
        assert (await _login(client)).status_code == 200

    async def test_weak_new_password(self, client):
        await _register(client)
        headers, _ = await _session(client)
        assert (await _change(client, headers, new="short")).status_code == 422

    async def test_account_without_password(self, client, db):
        user = User(email="oauth@example.com", password_hash=None, display_name="OAuth")
        db.add(user)
        headers = _bearer(create_access_token(user.id, user.email, api_key_id=None))
        response = await _change(client, headers)
        assert response.status_code == 400
        assert response.json()["detail"]["error"] == "password_not_set"

    async def test_api_key_session_cannot_change_password(self, client, db):
        user = User(email="bot@example.com", password_hash=None, display_name="Bot")
        db.add(user)
        headers = _bearer(create_access_token(user.id, user.email, api_key_id="key-1"))
        assert (await _change(client, headers)).status_code in (401, 403)

    async def test_change_cancels_pending_reset_link(self, client, outbox):
        await _register(client)
        token = await _reset_token(client, outbox)
        headers, _ = await _session(client)
        assert (await _change(client, headers)).status_code == 204
        stale = await client.post("/api/auth/password/reset", json={"token": token, "new_password": "third-pass-789"})
        assert stale.status_code == 400
