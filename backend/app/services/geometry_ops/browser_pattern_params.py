"""Проверка параметров массива тел: сервер хранит их как есть и геометрию не строит."""

import json
import math

from fastapi import status

from app.schemas.ids import is_body_id

from .browser_extrude import _error
from .limits import MAX_PARAMS_BYTES

MAX_PATTERN_INSTANCES = 100
MAX_SEPARATE_PATTERN_INSTANCES = 25
MAX_REFERENCE_NAME = 200
GLOBAL_AXES = ("x", "y", "z")
PATTERN_TYPES = ("linear", "circular")
PATTERN_MODES = ("join", "separate")
COUNT_KEYS = ("count", "count2")


def _invalid(description: str):
    _error("invalid_pattern_params", description)


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _vector(value: object) -> list[float]:
    if not isinstance(value, list) or len(value) != 3 or not all(_is_number(item) for item in value):
        _invalid("Ось массива задаётся точкой и направлением из трёх чисел.")
    return [float(item) for item in value]


def validated_axis(value: object) -> dict:
    if not isinstance(value, dict):
        _invalid("Укажите ось или направление массива.")
    kind = value.get("kind")
    if kind in GLOBAL_AXES:
        return {"kind": kind}
    if kind == "custom":
        origin, direction = _vector(value.get("origin")), _vector(value.get("direction"))
        if math.hypot(*direction) < 1e-9:
            _invalid("Ось массива нулевой длины.")
        return {"kind": kind, "origin": origin, "direction": direction}
    name = value.get("name")
    if kind not in ("edge", "face") or not is_body_id(value.get("body_id")):
        _invalid("Ось массива — X, Y, Z, ребро или грань тела.")
    if not isinstance(name, str) or not 0 < len(name) <= MAX_REFERENCE_NAME:
        _invalid("Укажите ребро или грань, задающие ось массива.")
    return {"kind": kind, "body_id": value["body_id"], "name": name}


def _count(value: object, minimum: int, description: str) -> int:
    if not _is_number(value) or int(value) != value or value < minimum:
        _invalid(description)
    return int(value)


def _nonzero(value: object, description: str) -> float:
    if not _is_number(value) or abs(value) < 1e-9:
        _invalid(description)
    return float(value)


def _circular(raw: dict) -> dict:
    angle = raw.get("angle")
    if not _is_number(angle) or not 0 < angle <= 360:
        _invalid("Угол кругового массива — от 0 до 360°.")
    return {"angle": float(angle)}


def _linear(raw: dict) -> dict:
    count2 = _count(raw.get("count2", 1), 1, "Количество во втором направлении — целое число от 1.")
    second = count2 > 1
    spacing2 = raw.get("spacing2")
    return {
        "spacing": _nonzero(raw.get("spacing"), "Шаг массива не может быть нулевым."),
        "axis2": validated_axis(raw.get("axis2")) if second else None,
        "count2": count2,
        "spacing2": _nonzero(spacing2, "Шаг во втором направлении не может быть нулевым.") if second else float(spacing2) if _is_number(spacing2) else 10.0,
    }


def instance_count(params: dict) -> int:
    return params["count"] * (params.get("count2") or 1) if params["pattern_type"] == "linear" else params["count"]


def _checked_limit(params: dict) -> None:
    separate = params["mode"] == "separate"
    limit = MAX_SEPARATE_PATTERN_INSTANCES if separate else MAX_PATTERN_INSTANCES
    if instance_count(params) > limit:
        _invalid(f"{'Отдельными телами' if separate else 'В массиве'} — не больше {limit} экземпляров.")


def validated_pattern(raw: object) -> dict:
    if not isinstance(raw, dict) or raw.get("pattern_type") not in PATTERN_TYPES or raw.get("mode") not in PATTERN_MODES:
        _invalid("Массив бывает линейным или круговым, результат — объединение или отдельные тела.")
    params = {
        "pattern_type": raw["pattern_type"],
        "mode": raw["mode"],
        "axis": validated_axis(raw.get("axis")),
        "count": _count(raw.get("count"), 2, "Количество экземпляров — целое число от 2."),
    }
    params.update(_circular(raw) if params["pattern_type"] == "circular" else _linear(raw))
    _checked_limit(params)
    return params


def parse_pattern_params(value: str) -> dict:
    if len(value.encode("utf-8")) > MAX_PARAMS_BYTES:
        _error("rebuild_params_too_large", "Параметры пересборки превышают 64 КБ.", status.HTTP_413_CONTENT_TOO_LARGE)
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        _invalid("Параметры массива должны быть JSON-объектом.")
    return validated_pattern(raw)


def pattern_reference_bodies(params: dict) -> list[str]:
    axes = [params.get("axis")]
    if params.get("pattern_type") == "linear" and _is_number(params.get("count2")) and params["count2"] > 1:
        axes.append(params.get("axis2"))
    ids = [axis.get("body_id") for axis in axes if isinstance(axis, dict) and axis.get("kind") in ("edge", "face")]
    return list(dict.fromkeys(body_id for body_id in ids if is_body_id(body_id)))


def checked_pattern_edit(old_params: dict, new_params: dict) -> dict:
    merged = validated_pattern({**old_params, **new_params})
    counts_changed = any(key in new_params and new_params[key] != old_params.get(key) for key in COUNT_KEYS)
    if merged["mode"] == "separate" and counts_changed:
        _error(
            "pattern_count_locked",
            "У массива отдельными телами количество задним числом не меняется: удалите массив и постройте его заново.",
        )
    return {key: merged[key] for key in new_params}
