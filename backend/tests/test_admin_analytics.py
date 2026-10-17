from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.api import deps
from app.api.routes import admin as admin_routes
from app.cli import build_parser, run
from app.config import get_settings
from app.core.security import create_access_token, hash_password
from app.models import ApiKey, Document, OAuthAccount, Project, RefreshToken, User
from app.services.admin_analytics import build_overview
from app.services.admin_directory import PageQuery, list_projects, list_users
from app.services.auth_service import authenticate_password_grant
from tests.fakes import FakeRedis

pytestmark = pytest.mark.asyncio

NOW = datetime(2026, 10, 17, 12, tzinfo=timezone.utc)
SECRET_LABEL = "СЕКРЕТНАЯ-МЕТКА-МОДЕЛИ"


def at(day: str, hour: int = 0) -> datetime:
    return datetime.fromisoformat(day).replace(hour=hour, tzinfo=timezone.utc)


def entry(kind: str, timestamp: str, label: str = "") -> dict:
    return {"id": f"tl-{kind}-{timestamp}", "kind": kind, "label": label or kind, "timestamp": timestamp, "params": {"distance": 10}}


def project(owner: User, name: str, created: datetime, storage: int, updated: datetime | None = None) -> Project:
    return Project(owner_id=owner.id, name=name, created_at=created, updated_at=updated or created, storage_bytes=storage)


def document(target: Project, timeline: list, components: dict, updated: datetime, version: int = 1) -> Document:
    return Document(
        project_id=target.id, timeline=timeline, components=components, doc_metadata={},
        version=version, created_at=target.created_at, updated_at=updated,
    )


@pytest_asyncio.fixture
async def world(pg_sessions):
    async with pg_sessions() as db:
        root = User(email="root@example.com", display_name="Root", password_hash="x", is_admin=True,
                    created_at=at("2026-08-01"), updated_at=at("2026-08-01"))
        alice = User(email="alice@example.com", display_name="Alice", password_hash="x",
                     created_at=at("2026-10-15", 10), updated_at=at("2026-10-15", 10))
        bob = User(email="bob@example.com", display_name="Bob", password_hash=None,
                   created_at=at("2026-09-01"), updated_at=at("2026-09-01"))
        db.add_all([root, alice, bob])
        await db.flush()

        bracket = project(alice, "Bracket", at("2026-10-15", 11), 1000)
        empty = project(alice, "Empty", at("2026-10-16", 8), 0)
        gear = project(bob, "Gear", at("2026-09-02"), 5000)
        db.add_all([bracket, empty, gear])
        await db.flush()

        db.add_all([
            document(bracket, [
                entry("sketch", "2026-10-15T11:01:00+00:00", SECRET_LABEL),
                entry("extrude", "2026-10-15T11:02:00+00:00"),
                entry("fillet", "2026-10-16T09:00:00+00:00"),
                entry("extrude", "2026-09-01T10:00:00+00:00"),
            ], {"body-aaaaaaaaaaaa": {"type": "body", "name": SECRET_LABEL}, "sketch-1": {"entities": []}},
                at("2026-10-16", 9), version=5),
            document(gear, [
                entry("sketch", "2026-09-02T10:00:00+00:00"),
                entry("revolve", "2026-09-02T10:05:00+00:00"),
                entry("chamfer", "garbage"),
            ], {"body-bbbbbbbbbbbb": {"type": "body"}}, at("2026-09-02")),
            OAuthAccount(user_id=alice.id, provider="yandex", provider_user_id="1"),
            OAuthAccount(user_id=bob.id, provider="github", provider_user_id="2"),
            RefreshToken(user_id=root.id, token_hash="h" * 64, family_id="f", expires_at=NOW + timedelta(days=30),
                         created_at=NOW - timedelta(hours=2)),
            ApiKey(user_id=bob.id, name="mcp", prefix="kr_", key_hash="k" * 64, created_at=at("2026-09-03"),
                   last_used_at=NOW - timedelta(days=3)),
        ])
        await db.commit()
        return {"root": root, "alice": alice, "bob": bob, "bracket": bracket, "empty": empty, "gear": gear}


@pytest_asyncio.fixture
async def db(pg_sessions):
    async with pg_sessions() as session:
        yield session


def page(sort: str, order: str = "desc", q: str | None = None, limit: int = 50, offset: int = 0) -> PageQuery:
    return PageQuery(limit=limit, offset=offset, sort=sort, order=order, q=q)


class TestOverview:
    async def test_totals_and_activity(self, world, db):
        overview = await build_overview(db, 7, NOW)
        assert overview["since"] == at("2026-10-11")
        assert overview["users"] == {"total": 3, "new": 1, "admins": 1, "active_1d": 1, "active_7d": 3, "active_30d": 3}
        assert overview["projects"] == {
            "total": 3, "new": 2, "storage_bytes": 6000, "with_bodies": 2, "empty": 1,
            "operations_total": 5, "avg_operations": 1.67,
        }
        assert overview["api_keys"] == {"keys": 1, "users": 1, "active_users": 1}

    async def test_operation_breakdown(self, world, db):
        overview = await build_overview(db, 7, NOW)
        by_kind = {item["kind"]: item for item in overview["operations"]}
        assert by_kind["sketch"] == {"kind": "sketch", "count": 2, "projects": 2, "period_count": 1}
        assert by_kind["extrude"] == {"kind": "extrude", "count": 2, "projects": 1, "period_count": 1}
        assert by_kind["fillet"]["period_count"] == 1
        assert by_kind["revolve"] == {"kind": "revolve", "count": 1, "projects": 1, "period_count": 0}
        assert by_kind["chamfer"] == {"kind": "chamfer", "count": 1, "projects": 1, "period_count": 0}

    async def test_daily_series_covers_every_day(self, world, db):
        series = (await build_overview(db, 7, NOW))["series"]
        assert [point["date"] for point in series] == [date(2026, 10, 11) + timedelta(days=i) for i in range(7)]
        by_day = {point["date"].isoformat(): point for point in series}
        assert by_day["2026-10-15"] == {
            "date": date(2026, 10, 15), "registrations": 1, "projects": 1, "active_users": 1, "operations": 1,
        }
        assert by_day["2026-10-16"]["projects"] == 1 and by_day["2026-10-16"]["operations"] == 1
        assert by_day["2026-10-14"]["active_users"] == 1
        assert by_day["2026-10-17"]["active_users"] == 1
        assert by_day["2026-10-12"] == {
            "date": date(2026, 10, 12), "registrations": 0, "projects": 0, "active_users": 0, "operations": 0,
        }

    async def test_wider_period_counts_older_work(self, world, db):
        overview = await build_overview(db, 60, NOW)
        assert overview["users"]["new"] == 2
        assert overview["projects"]["new"] == 3
        assert len(overview["series"]) == 60


class TestUsers:
    async def test_rows_carry_usage(self, world, db):
        result = await list_users(db, page("created_at"))
        assert result["total"] == 3
        alice, bob, root = result["items"]
        assert (alice["email"], bob["email"], root["email"]) == ("alice@example.com", "bob@example.com", "root@example.com")
        assert alice["projects"] == 2 and alice["storage_bytes"] == 1000 and alice["operations"] == 3
        assert alice["last_activity_at"] == at("2026-10-16", 9)
        assert alice["auth_methods"] == ["password", "yandex"]
        assert bob["auth_methods"] == ["github"] and bob["api_keys"] == 1 and bob["operations"] == 2
        assert root["is_admin"] and root["last_seen_at"] == NOW - timedelta(hours=2) and root["projects"] == 0

    async def test_sort_search_and_paging(self, world, db):
        by_projects = await list_users(db, page("projects"))
        assert [row["email"] for row in by_projects["items"]] == ["alice@example.com", "bob@example.com", "root@example.com"]

        found = await list_users(db, page("created_at", q="ALI"))
        assert found["total"] == 1 and found["items"][0]["email"] == "alice@example.com"
        assert (await list_users(db, page("created_at", q="%")))["total"] == 0

        second = await list_users(db, page("email", "asc", limit=1, offset=1))
        assert second["total"] == 3 and [row["email"] for row in second["items"]] == ["bob@example.com"]


class TestProjects:
    async def test_rows_carry_metadata(self, world, db):
        result = await list_projects(db, page("updated_at"))
        assert [row["name"] for row in result["items"]] == ["Bracket", "Empty", "Gear"]
        bracket, empty, gear = result["items"]
        assert bracket["owner_email"] == "alice@example.com"
        assert (bracket["operations"], bracket["sketches"], bracket["bodies"], bracket["document_version"]) == (3, 1, 1, 5)
        assert bracket["top_operations"] == [{"kind": "extrude", "count": 2}, {"kind": "fillet", "count": 1}]
        assert bracket["updated_at"] == at("2026-10-16", 9)
        assert (empty["operations"], empty["bodies"], empty["document_version"], empty["top_operations"]) == (0, 0, None, [])
        assert gear["top_operations"] == [{"kind": "chamfer", "count": 1}, {"kind": "revolve", "count": 1}]

    async def test_sort_and_search(self, world, db):
        by_storage = await list_projects(db, page("storage_bytes"))
        assert [row["name"] for row in by_storage["items"]] == ["Gear", "Bracket", "Empty"]
        by_owner = await list_projects(db, page("updated_at", q="bob@"))
        assert [row["name"] for row in by_owner["items"]] == ["Gear"]


class TestHttp:
    @pytest.fixture
    def client(self, pg_sessions):
        application = FastAPI()
        application.include_router(admin_routes.router, prefix="/api")

        async def override_db():
            async with pg_sessions() as session:
                yield session

        application.dependency_overrides[deps.get_db] = override_db
        return AsyncClient(transport=ASGITransport(app=application), base_url="http://test")

    async def test_admin_endpoints_never_expose_model_content(self, world, client):
        root = world["root"]
        headers = {"Authorization": f"Bearer {create_access_token(root.id, root.email, api_key_id=None)}"}
        bodies = []
        for url in ("/api/admin/overview?days=30", "/api/admin/users?limit=200", "/api/admin/projects?limit=200&sort=name&order=asc"):
            response = await client.get(url, headers=headers)
            assert response.status_code == 200, response.text
            bodies.append(response.text)
        assert '"total":3' in bodies[1] and '"total":3' in bodies[2]
        for body in bodies:
            assert SECRET_LABEL not in body
            for field in ('"timeline"', '"components"', '"params"', '"thumbnail"', '"password_hash"'):
                assert field not in body


class TestCli:
    async def test_grant_revoke_and_list(self, world, pg_sessions):
        parser = build_parser()
        code, message = await run(parser.parse_args(["admin", "grant", " ALICE@example.com "]), pg_sessions)
        assert code == 0 and "alice@example.com" in message

        code, message = await run(parser.parse_args(["admin", "list"]), pg_sessions)
        assert message.splitlines() == ["alice@example.com", "root@example.com"]

        code, _ = await run(parser.parse_args(["admin", "revoke", "root@example.com"]), pg_sessions)
        assert code == 0
        async with pg_sessions() as db:
            admins = (await db.execute(select(User.email).where(User.is_admin.is_(True)))).scalars().all()
        assert admins == ["alice@example.com"]

    async def test_unknown_email_fails(self, world, pg_sessions):
        code, message = await run(build_parser().parse_args(["admin", "grant", "ghost@example.com"]), pg_sessions)
        assert code == 1 and "ghost@example.com" in message


class TestPasswordGrantPromotion:
    async def test_listed_email_becomes_admin_on_login(self, pg_sessions, monkeypatch):
        async with pg_sessions() as db:
            db.add(User(email="carol@example.com", display_name="Carol", password_hash=await hash_password("carol-pass-1")))
            await db.commit()
        monkeypatch.setattr(get_settings(), "ADMIN_EMAILS", "carol@example.com")
        async with pg_sessions() as db:
            await authenticate_password_grant(db, FakeRedis(), "Carol@example.com", "carol-pass-1", "198.51.100.7")
        async with pg_sessions() as db:
            carol = (await db.execute(select(User).where(User.email == "carol@example.com"))).scalar_one()
        assert carol.is_admin
