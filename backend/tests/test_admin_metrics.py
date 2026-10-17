from datetime import date, datetime, timezone

from app.services.admin_metrics import auth_methods, average, fill_daily_series, like_pattern, period_start, top_kinds_by_project

NOW = datetime(2026, 10, 17, 23, 30, tzinfo=timezone.utc)


def test_period_starts_at_utc_midnight_including_today():
    assert period_start(NOW, 1) == datetime(2026, 10, 17, tzinfo=timezone.utc)
    assert period_start(NOW, 7) == datetime(2026, 10, 11, tzinfo=timezone.utc)


def test_series_fills_missing_days_with_zero():
    series = fill_daily_series(NOW, 3, {"registrations": {date(2026, 10, 16): 2}, "operations": {date(2026, 10, 1): 9}})
    assert series == [
        {"date": date(2026, 10, 15), "registrations": 0, "projects": 0, "active_users": 0, "operations": 0},
        {"date": date(2026, 10, 16), "registrations": 2, "projects": 0, "active_users": 0, "operations": 0},
        {"date": date(2026, 10, 17), "registrations": 0, "projects": 0, "active_users": 0, "operations": 0},
    ]


def test_top_kinds_are_sorted_and_capped():
    rows = [("p1", "fillet", 1), ("p1", "extrude", 4), ("p1", "chamfer", 1), ("p1", "hole", 2), ("p2", "loft", 1)]
    assert top_kinds_by_project(rows) == {
        "p1": [{"kind": "extrude", "count": 4}, {"kind": "hole", "count": 2}, {"kind": "chamfer", "count": 1}],
        "p2": [{"kind": "loft", "count": 1}],
    }


def test_average_handles_empty_set():
    assert average(5, 3) == 1.67
    assert average(5, 0) == 0.0


def test_like_pattern_escapes_wildcards():
    assert like_pattern(" a%b_c\\ ") == "%a\\%b\\_c\\\\%"


def test_auth_methods_list_password_first():
    assert auth_methods(True, "yandex,github") == ["password", "github", "yandex"]
    assert auth_methods(False, None) == []
