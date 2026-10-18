from datetime import date, datetime, timezone

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api import deps
from app.api.routes import admin as admin_routes
from app.api.routes import auth as auth_routes
from app.config import get_settings
from app.core.security import create_access_token
from app.models.base import utcnow
from app.models.user import User
from app.services import admin_analytics, auth_service
from app.services.admin_roles import is_listed_admin, promote_listed_admin
from app.services.api_key_service import create_api_key
from tests.fakes import FakeDb, FakeRedis

pytestmark = pytest.mark.asyncio

ADMIN_URLS = ("/api/admin/overview", "/api/admin/users", "/api/admin/projects")
NOW = datetime(2026, 10, 17, 12, tzinfo=timezone.utc)


def _add_user(db: FakeDb, email: str, *, is_admin: bool = False) -> User:
    user = User(email=email, password_hash=None, display_name=email, is_admin=is_admin)
    db.add(user)
    return user


def _bearer(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.email, api_key_id=None)}"}


@pytest.fixture
def db():
    return FakeDb()


@pytest.fixture
def redis():
    return FakeRedis()


@pytest.fixture
def root(db):
    return _add_user(db, "root@example.com", is_admin=True)


@pytest.fixture
def alice(db):
    return _add_user(db, "alice@example.com")


@pytest.fixture
def admin_emails(monkeypatch):
    def configure(value: str) -> None:
        monkeypatch.setattr(get_settings(), "ADMIN_EMAILS", value)

    configure("")
    return configure


@pytest.fixture
def client(db, redis):
    application = FastAPI()
    application.include_router(auth_routes.router, prefix="/api")
    application.include_router(admin_routes.router, prefix="/api")

    async def override_db():
        yield db

    async def override_redis():
        yield redis

    application.dependency_overrides[deps.get_db] = override_db
    application.dependency_overrides[deps.get_redis] = override_redis
    return AsyncClient(transport=ASGITransport(app=application, client=("198.51.100.7", 1234)), base_url="http://test")


@pytest.fixture
def stub_overview(monkeypatch):
    async def build(_db, days, now=None):
        return {
            "period_days": days,
            "since": NOW,
            "generated_at": NOW,
            "users": {"total": 2, "new": 1, "admins": 1, "active_1d": 1, "active_7d": 2, "active_30d": 2},
            "projects": {
                "total": 0, "new": 0, "storage_bytes": 0, "with_bodies": 0, "empty": 0,
                "operations_total": 0, "avg_operations": 0.0,
            },
            "api_keys": {"keys": 0, "users": 0, "active_users": 0},
            "operations": [],
            "series": [{"date": date(2026, 10, 17), "registrations": 1, "projects": 0, "active_users": 1, "operations": 0}],
        }

    monkeypatch.setattr(admin_analytics, "build_overview", build)


class TestAccess:
    @pytest.mark.parametrize("url", ADMIN_URLS)
    async def test_anonymous_gets_401(self, client, url):
        response = await client.get(url)
        assert response.status_code == 401

    async def test_anonymous_patch_gets_401(self, client, alice):
        response = await client.patch(f"/api/admin/users/{alice.id}", json={"is_admin": True})
        assert response.status_code == 401

    @pytest.mark.parametrize("url", ADMIN_URLS)
    async def test_regular_user_gets_403(self, client, alice, url):
        response = await client.get(url, headers=_bearer(alice))
        assert response.status_code == 403
        assert response.json()["detail"]["error"] == "forbidden"

    async def test_regular_user_cannot_change_roles(self, client, root, alice):
        response = await client.patch(f"/api/admin/users/{root.id}", json={"is_admin": False}, headers=_bearer(alice))
        assert response.status_code == 403
        assert root.is_admin and not alice.is_admin

    async def test_admin_reads_overview(self, client, root, stub_overview):
        response = await client.get("/api/admin/overview?days=7", headers=_bearer(root))
        assert response.status_code == 200
        assert response.json()["period_days"] == 7

    @pytest.mark.parametrize("query", ["days=0", "days=366"])
    async def test_overview_period_is_bounded(self, client, root, stub_overview, query):
        response = await client.get(f"/api/admin/overview?{query}", headers=_bearer(root))
        assert response.status_code == 422

    @pytest.mark.parametrize("query", ["limit=201", "limit=0", "offset=-1", "sort=password_hash", "order=sideways"])
    async def test_list_params_are_whitelisted(self, client, root, query):
        response = await client.get(f"/api/admin/users?{query}", headers=_bearer(root))
        assert response.status_code == 422


class TestRoleManagement:
    async def test_admin_grants_and_revokes_role(self, client, root, alice):
        granted = await client.patch(f"/api/admin/users/{alice.id}", json={"is_admin": True}, headers=_bearer(root))
        assert granted.status_code == 200
        assert granted.json() == {"id": alice.id, "email": alice.email, "is_admin": True}
        assert alice.is_admin

        revoked = await client.patch(f"/api/admin/users/{alice.id}", json={"is_admin": False}, headers=_bearer(root))
        assert revoked.status_code == 200
        assert not alice.is_admin

    async def test_admin_cannot_demote_self(self, client, root):
        response = await client.patch(f"/api/admin/users/{root.id}", json={"is_admin": False}, headers=_bearer(root))
        assert response.status_code == 400
        assert response.json()["detail"]["error"] == "cannot_demote_self"
        assert root.is_admin

    async def test_unknown_user_is_404(self, client, root):
        response = await client.patch("/api/admin/users/" + "0" * 32, json={"is_admin": True}, headers=_bearer(root))
        assert response.status_code == 404


class TestAdminEmails:
    async def test_list_is_case_insensitive_and_trimmed(self, admin_emails):
        admin_emails(" Root@Example.com , boss@example.com,")
        assert is_listed_admin("root@example.com")
        assert is_listed_admin("BOSS@example.com")
        assert not is_listed_admin("alice@example.com")

    async def test_me_reports_role_and_promotes_listed_email(self, client, db, alice, admin_emails):
        before = await client.get("/api/auth/me", headers=_bearer(alice))
        assert before.json()["is_admin"] is False

        admin_emails("alice@example.com")
        after = await client.get("/api/auth/me", headers=_bearer(alice))
        assert after.json()["is_admin"] is True
        assert alice.is_admin
        assert db.commits == 1

    async def test_refresh_promotes_listed_email(self, client, db, redis, alice, admin_emails):
        raw_token = await auth_service._start_refresh_family(db, redis, alice.id, api_key_id=None)
        admin_emails("alice@example.com")
        response = await client.post("/api/auth/refresh", headers={"Cookie": f"refresh_token={raw_token}"})
        assert response.status_code == 200
        assert alice.is_admin

    async def test_api_key_grant_promotes_listed_email(self, client, db, alice, admin_emails):
        alice.email_verified_at = utcnow()
        _, raw_key = await create_api_key(db, alice, "Claude Code")
        admin_emails("alice@example.com")
        response = await client.post("/api/auth/token", data={"grant_type": "api_key", "api_key": raw_key})
        assert response.status_code == 200
        assert alice.is_admin

    async def test_listed_admin_is_never_demoted_by_env(self, client, root, admin_emails):
        admin_emails("someone-else@example.com")
        assert not promote_listed_admin(root)
        response = await client.get("/api/auth/me", headers=_bearer(root))
        assert response.json()["is_admin"] is True
