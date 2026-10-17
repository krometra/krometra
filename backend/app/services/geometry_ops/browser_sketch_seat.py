"""Эскизы на гранях browser-тел: тело-владелец и приём плоскостей, пересчитанных браузерным ядром."""

import math

from fastapi import status

from .browser_extrude import _error

STABLE_FACE_PREFIX = "f-"
SKETCH_FEATURES = ("extrude", "revolve", "sweep", "loft")
PLANES = ("XY", "XZ", "YZ")
BASIS_AXES = ("origin", "u", "v", "n")


def _is_sketch(component: object) -> bool:
    return isinstance(component, dict) and isinstance(component.get("entities"), list)


def sketch_owner(components: dict, sketch_id: object) -> str | None:
    sketch = components.get(sketch_id) if isinstance(sketch_id, str) else None
    if not _is_sketch(sketch):
        return None
    body_id, face_name = sketch.get("ref_body_id"), sketch.get("ref_face_id")
    if not isinstance(body_id, str) or not body_id:
        return None
    if not isinstance(face_name, str) or not face_name.startswith(STABLE_FACE_PREFIX) or len(face_name) <= len(STABLE_FACE_PREFIX):
        return None
    return body_id


def feature_sketch_owner(components: dict, entry: dict) -> str | None:
    if entry.get("kind") not in SKETCH_FEATURES:
        return None
    return sketch_owner(components, entry.get("sketch_id"))


def seated_sketches(components: dict, rebuilt_bodies: set[str]) -> set[str]:
    owners = {sketch_id: sketch_owner(components, sketch_id) for sketch_id in components}
    return {sketch_id for sketch_id, owner in owners.items() if owner is not None and owner in rebuilt_bodies}


def reassign_sketch_owner(components: dict, superseded_bodies: set[str], body_id: str) -> None:
    for sketch_id in seated_sketches(components, superseded_bodies):
        components[sketch_id] = {**components[sketch_id], "ref_body_id": body_id}


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_vector(value: object) -> bool:
    return isinstance(value, list) and len(value) == 3 and all(_is_number(item) for item in value)


def _validated_plane(plane: object) -> dict:
    basis = plane.get("plane_basis") if isinstance(plane, dict) else None
    if (
        not isinstance(plane, dict)
        or plane.get("plane") not in PLANES
        or not _is_number(plane.get("plane_offset"))
        or not isinstance(basis, dict)
        or not all(_is_vector(basis.get(axis)) for axis in BASIS_AXES)
    ):
        _error("invalid_sketch_plane", "Некорректная плоскость эскиза после пересборки.")
    return {
        "plane": plane["plane"],
        "plane_offset": float(plane["plane_offset"]),
        "plane_basis": {axis: [float(value) for value in basis[axis]] for axis in BASIS_AXES},
    }


def _sketches_mismatch():
    _error(
        "rebuild_sketches_mismatch",
        "Плоскости эскизов не совпадают с эскизами на пересобранных телах. Обновите страницу и повторите.",
        status.HTTP_409_CONFLICT,
    )


def validated_sketch_planes(planes: dict, expected: set[str]) -> dict[str, dict]:
    if set(planes) != expected:
        _sketches_mismatch()
    return {sketch_id: _validated_plane(plane) for sketch_id, plane in planes.items()}


def validated_partial_sketch_planes(planes: dict, allowed: set[str]) -> dict[str, dict]:
    if not set(planes) <= allowed:
        _sketches_mismatch()
    return {sketch_id: _validated_plane(plane) for sketch_id, plane in planes.items()}


def apply_sketch_planes(components: dict, timeline: list, planes: dict[str, dict]) -> None:
    for sketch_id, plane in planes.items():
        components[sketch_id] = {**components[sketch_id], **plane}
    for index, entry in enumerate(timeline):
        if entry.get("kind") == "sketch" and entry.get("sketch_id") in planes:
            timeline[index] = {**entry, "plane": planes[entry["sketch_id"]]["plane"]}
