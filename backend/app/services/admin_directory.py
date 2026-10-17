from dataclasses import dataclass

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.admin_analytics import COMPONENTS, IS_OPERATION, TIMELINE
from app.services.admin_metrics import auth_methods, like_pattern, top_kinds_by_project

USER_SORTS = {
    "email": "u.email",
    "display_name": "u.display_name",
    "created_at": "u.created_at",
    "is_admin": "u.is_admin",
    "projects": "project_count",
    "storage_bytes": "storage_bytes",
    "operations": "operations",
    "last_activity_at": "last_activity_at",
    "last_seen_at": "last_seen_at",
}

PROJECT_SORTS = {
    "name": "p.name",
    "owner_email": "u.email",
    "created_at": "p.created_at",
    "updated_at": "updated_at",
    "storage_bytes": "p.storage_bytes",
    "operations": "operations",
    "bodies": "bodies",
    "sketches": "sketches",
    "document_version": "d.version",
}

USERS_FROM = f"""
    FROM users u
    LEFT JOIN LATERAL (
        SELECT count(*) AS project_count,
               coalesce(sum(pr.storage_bytes), 0) AS storage_bytes,
               max(greatest(pr.updated_at, d.updated_at)) AS last_activity_at,
               coalesce(sum((SELECT count(*) FROM {TIMELINE} e WHERE {IS_OPERATION})), 0) AS operations
        FROM projects pr LEFT JOIN documents d ON d.project_id = pr.id
        WHERE pr.owner_id = u.id
    ) p ON true
    LEFT JOIN LATERAL (SELECT max(created_at) AS last_seen_at FROM refresh_tokens WHERE user_id = u.id) r ON true
    LEFT JOIN LATERAL (SELECT string_agg(DISTINCT provider, ',') AS providers FROM oauth_accounts WHERE user_id = u.id) o ON true
    LEFT JOIN LATERAL (SELECT count(*) AS api_keys FROM api_keys WHERE user_id = u.id) k ON true
"""

USERS_FILTER = "WHERE u.email ILIKE :pattern ESCAPE '\\' OR u.display_name ILIKE :pattern ESCAPE '\\'"

PROJECTS_FROM = f"""
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN documents d ON d.project_id = p.id
    LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE {IS_OPERATION}) AS operations,
               count(*) FILTER (WHERE e->>'kind' = 'sketch') AS sketches
        FROM {TIMELINE} e
    ) t ON true
    LEFT JOIN LATERAL (SELECT count(*) AS bodies FROM {COMPONENTS} c WHERE c.value->>'type' = 'body') b ON true
"""

PROJECTS_FILTER = "WHERE p.name ILIKE :pattern ESCAPE '\\' OR u.email ILIKE :pattern ESCAPE '\\'"

PROJECT_KINDS_SQL = text(f"""
    SELECT d.project_id, coalesce(e->>'kind', 'unknown') AS kind, count(*) AS count
    FROM documents d CROSS JOIN LATERAL {TIMELINE} e
    WHERE d.project_id IN :ids AND {IS_OPERATION}
    GROUP BY 1, 2
""").bindparams(bindparam("ids", expanding=True))


@dataclass(frozen=True)
class PageQuery:
    limit: int
    offset: int
    sort: str
    order: str
    q: str | None = None

    @property
    def pattern(self) -> str | None:
        return like_pattern(self.q) if self.q and self.q.strip() else None


def _order_by(sorts: dict[str, str], page: PageQuery, tiebreak: str) -> str:
    direction = "DESC" if page.order == "desc" else "ASC"
    return f"ORDER BY {sorts[page.sort]} {direction} NULLS LAST, {tiebreak}"


async def _page(db: AsyncSession, select_sql: str, from_sql: str, filter_sql: str, order_sql: str, page: PageQuery):
    where = filter_sql if page.pattern else ""
    params = {"pattern": page.pattern} if page.pattern else {}
    total = (await db.execute(text(f"SELECT count(*) {from_sql} {where}"), params)).scalar_one()
    rows = (await db.execute(
        text(f"{select_sql} {from_sql} {where} {order_sql} LIMIT :limit OFFSET :offset"),
        {**params, "limit": page.limit, "offset": page.offset},
    )).all()
    return total, rows


async def list_users(db: AsyncSession, page: PageQuery) -> dict:
    select_sql = """
        SELECT u.id, u.email, u.display_name, u.created_at, u.is_admin,
               u.password_hash IS NOT NULL AS has_password, o.providers,
               p.project_count, p.storage_bytes, p.last_activity_at, p.operations,
               r.last_seen_at, k.api_keys
    """
    total, rows = await _page(db, select_sql, USERS_FROM, USERS_FILTER, _order_by(USER_SORTS, page, "u.id"), page)
    items = [
        {
            "id": row.id,
            "email": row.email,
            "display_name": row.display_name,
            "created_at": row.created_at,
            "is_admin": row.is_admin,
            "auth_methods": auth_methods(row.has_password, row.providers),
            "projects": row.project_count,
            "storage_bytes": int(row.storage_bytes),
            "operations": int(row.operations),
            "last_activity_at": row.last_activity_at,
            "last_seen_at": row.last_seen_at,
            "api_keys": row.api_keys,
        }
        for row in rows
    ]
    return {"items": items, "total": total, "limit": page.limit, "offset": page.offset}


async def list_projects(db: AsyncSession, page: PageQuery) -> dict:
    select_sql = """
        SELECT p.id, p.name, p.owner_id, u.email AS owner_email, p.created_at,
               greatest(p.updated_at, d.updated_at) AS updated_at, p.storage_bytes, d.version AS document_version,
               coalesce(t.operations, 0) AS operations, coalesce(t.sketches, 0) AS sketches, coalesce(b.bodies, 0) AS bodies
    """
    total, rows = await _page(db, select_sql, PROJECTS_FROM, PROJECTS_FILTER, _order_by(PROJECT_SORTS, page, "p.id"), page)
    ids = [row.id for row in rows]
    kinds = top_kinds_by_project((await db.execute(PROJECT_KINDS_SQL, {"ids": ids})).all()) if ids else {}
    items = [
        {
            "id": row.id,
            "name": row.name,
            "owner_id": row.owner_id,
            "owner_email": row.owner_email,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "storage_bytes": int(row.storage_bytes),
            "document_version": row.document_version,
            "operations": row.operations,
            "sketches": row.sketches,
            "bodies": row.bodies,
            "top_operations": kinds.get(row.id, []),
        }
        for row in rows
    ]
    return {"items": items, "total": total, "limit": page.limit, "offset": page.offset}
