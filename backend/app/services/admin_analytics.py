from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import utcnow
from app.services.admin_metrics import average, fill_daily_series, period_start

TIMELINE = "jsonb_array_elements(CASE WHEN jsonb_typeof(d.timeline) = 'array' THEN d.timeline ELSE '[]'::jsonb END)"
COMPONENTS = "jsonb_each(CASE WHEN jsonb_typeof(d.components) = 'object' THEN d.components ELSE '{}'::jsonb END)"
ENTRY_TIME = (
    "CASE WHEN e->>'timestamp' ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}' THEN (e->>'timestamp')::timestamptz END"
)
IS_OPERATION = "e->>'kind' IS DISTINCT FROM 'sketch'"
UTC_DAY = "(at AT TIME ZONE 'UTC')::date"

USERS_SQL = text("""
    SELECT count(*) AS total,
           count(*) FILTER (WHERE created_at >= :since) AS new,
           count(*) FILTER (WHERE is_admin) AS admins
    FROM users
""")

PROJECTS_SQL = text(f"""
    SELECT count(*) AS total,
           count(*) FILTER (WHERE p.created_at >= :since) AS new,
           coalesce(sum(p.storage_bytes), 0) AS storage_bytes,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM {COMPONENTS} c WHERE c.value->>'type' = 'body')) AS with_bodies
    FROM projects p
    LEFT JOIN documents d ON d.project_id = p.id
""")

OPERATIONS_SQL = text(f"""
    SELECT coalesce(e->>'kind', 'unknown') AS kind,
           count(*) AS count,
           count(DISTINCT d.project_id) AS projects,
           count(*) FILTER (WHERE {ENTRY_TIME} >= :since) AS period_count
    FROM documents d
    CROSS JOIN LATERAL {TIMELINE} e
    GROUP BY 1
    ORDER BY count DESC, kind
""")

API_KEYS_SQL = text("""
    SELECT count(*) AS keys,
           count(DISTINCT user_id) AS users,
           count(DISTINCT user_id) FILTER (WHERE last_used_at >= :since) AS active_users
    FROM api_keys
""")

ACTIVITY_EVENTS = f"""
    WITH events AS (
        SELECT id AS user_id, created_at AS at FROM users
        UNION ALL SELECT user_id, created_at FROM refresh_tokens
        UNION ALL SELECT user_id, last_used_at FROM api_keys WHERE last_used_at IS NOT NULL
        UNION ALL SELECT owner_id, created_at FROM projects
        UNION ALL SELECT owner_id, updated_at FROM projects
        UNION ALL SELECT p.owner_id, d.updated_at FROM documents d JOIN projects p ON p.id = d.project_id
        UNION ALL SELECT p.owner_id, {ENTRY_TIME}
            FROM documents d JOIN projects p ON p.id = d.project_id CROSS JOIN LATERAL {TIMELINE} e
    )
"""

ACTIVE_SQL = text(ACTIVITY_EVENTS + """
    SELECT count(DISTINCT user_id) FILTER (WHERE at >= :since_1d) AS active_1d,
           count(DISTINCT user_id) FILTER (WHERE at >= :since_7d) AS active_7d,
           count(DISTINCT user_id) AS active_30d
    FROM events
    WHERE at >= :since_30d AND at <= :now
""")

DAILY_ACTIVE_SQL = text(ACTIVITY_EVENTS + f"""
    SELECT {UTC_DAY} AS day, count(DISTINCT user_id) AS value
    FROM events WHERE at >= :since AND at <= :now
    GROUP BY 1
""")

DAILY_REGISTRATIONS_SQL = text(f"""
    SELECT {UTC_DAY} AS day, count(*) AS value
    FROM (SELECT created_at AS at FROM users) s WHERE at >= :since GROUP BY 1
""")

DAILY_PROJECTS_SQL = text(f"""
    SELECT {UTC_DAY} AS day, count(*) AS value
    FROM (SELECT created_at AS at FROM projects) s WHERE at >= :since GROUP BY 1
""")

DAILY_OPERATIONS_SQL = text(f"""
    SELECT {UTC_DAY} AS day, count(*) AS value
    FROM (SELECT {ENTRY_TIME} AS at FROM documents d CROSS JOIN LATERAL {TIMELINE} e WHERE {IS_OPERATION}) s
    WHERE at >= :since GROUP BY 1
""")


async def _daily(db: AsyncSession, statement, params: dict) -> dict[date, int]:
    rows = (await db.execute(statement, params)).all()
    return {row.day: int(row.value) for row in rows}


async def _active_users(db: AsyncSession, now: datetime) -> dict:
    row = (await db.execute(ACTIVE_SQL, {
        "now": now,
        "since_1d": now - timedelta(days=1),
        "since_7d": now - timedelta(days=7),
        "since_30d": now - timedelta(days=30),
    })).one()
    return {"active_1d": row.active_1d, "active_7d": row.active_7d, "active_30d": row.active_30d}


async def _series(db: AsyncSession, now: datetime, days: int, since: datetime) -> list[dict]:
    counts: dict[str, dict[date, int]] = defaultdict(dict)
    counts["registrations"] = await _daily(db, DAILY_REGISTRATIONS_SQL, {"since": since})
    counts["projects"] = await _daily(db, DAILY_PROJECTS_SQL, {"since": since})
    counts["active_users"] = await _daily(db, DAILY_ACTIVE_SQL, {"since": since, "now": now})
    counts["operations"] = await _daily(db, DAILY_OPERATIONS_SQL, {"since": since})
    return fill_daily_series(now, days, counts)


async def build_overview(db: AsyncSession, days: int, now: datetime | None = None) -> dict:
    now = now or utcnow()
    since = period_start(now, days)
    users = (await db.execute(USERS_SQL, {"since": since})).one()
    projects = (await db.execute(PROJECTS_SQL, {"since": since})).one()
    api_keys = (await db.execute(API_KEYS_SQL, {"since": since})).one()
    operations = [
        {"kind": row.kind, "count": row.count, "projects": row.projects, "period_count": row.period_count}
        for row in (await db.execute(OPERATIONS_SQL, {"since": since})).all()
    ]
    operations_total = sum(item["count"] for item in operations if item["kind"] != "sketch")
    return {
        "period_days": days,
        "since": since,
        "generated_at": now,
        "users": {"total": users.total, "new": users.new, "admins": users.admins, **await _active_users(db, now)},
        "projects": {
            "total": projects.total,
            "new": projects.new,
            "storage_bytes": int(projects.storage_bytes),
            "with_bodies": projects.with_bodies,
            "empty": projects.total - projects.with_bodies,
            "operations_total": operations_total,
            "avg_operations": average(operations_total, projects.total),
        },
        "api_keys": {"keys": api_keys.keys, "users": api_keys.users, "active_users": api_keys.active_users},
        "operations": operations,
        "series": await _series(db, now, days, since),
    }
