from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Iterable

SERIES_FIELDS = ("registrations", "projects", "active_users", "operations")
TOP_KINDS_LIMIT = 3


def period_start(now: datetime, days: int) -> datetime:
    today = now.astimezone(timezone.utc).date()
    first_day = today - timedelta(days=days - 1)
    return datetime(first_day.year, first_day.month, first_day.day, tzinfo=timezone.utc)


def fill_daily_series(now: datetime, days: int, counts: dict[str, dict[date, int]]) -> list[dict]:
    first_day = period_start(now, days).date()
    series = []
    for offset in range(days):
        day = first_day + timedelta(days=offset)
        point = {"date": day}
        for field in SERIES_FIELDS:
            point[field] = int(counts.get(field, {}).get(day, 0))
        series.append(point)
    return series


def top_kinds_by_project(rows: Iterable[tuple[str, str, int]], limit: int = TOP_KINDS_LIMIT) -> dict[str, list[dict]]:
    grouped: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for project_id, kind, count in rows:
        grouped[project_id].append((kind, int(count)))
    return {
        project_id: [{"kind": kind, "count": count} for kind, count in sorted(kinds, key=lambda item: (-item[1], item[0]))[:limit]]
        for project_id, kinds in grouped.items()
    }


def average(total: int, count: int) -> float:
    return round(total / count, 2) if count else 0.0


def like_pattern(query: str) -> str:
    escaped = query.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def auth_methods(has_password: bool, providers: str | None) -> list[str]:
    methods = ["password"] if has_password else []
    methods.extend(sorted(provider for provider in (providers or "").split(",") if provider))
    return methods
