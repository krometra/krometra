"""Общее для сохранения геометрии: ключи хранилища и подписи истории."""

import uuid

from fastapi import HTTPException, status

from app.schemas.ids import is_body_id

_LABELS = {
    "sketch": "Эскиз",
    "extrude": "Выдавить",
    "boolean": "Boolean",
    "revolve": "Вращение",
    "sweep": "По траектории",
    "fillet": "Скругление",
    "chamfer": "Фаска",
    "thread": "Резьба",
    "import": "Импорт",
    "transform": "Перемещение",
    "shell": "Оболочка",
    "mirror": "Зеркало",
    "hole": "Отверстие",
    "pattern": "Массив",
}


def next_label(timeline: list, kind: str) -> str:
    """Return next human-readable label for a timeline entry kind."""
    count = sum(1 for e in timeline if e.get("kind") == kind)
    return f"{_LABELS.get(kind, kind)} {count + 1}"


def new_body_id() -> str:
    return f"body-{uuid.uuid4().hex[:12]}"


def checked_body_id(body_id: object) -> str:
    if not is_body_id(body_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_body_id", "error_description": "Некорректный идентификатор тела."},
        )
    return body_id


def _geometry_key(project_id: str, body_id: str, suffix: str) -> str:
    return f"{project_id}/geometry/{checked_body_id(body_id)}.{suffix}"


def mesh_key(project_id: str, body_id: str) -> str:
    return _geometry_key(project_id, body_id, "mesh")


def browser_step_key(project_id: str, body_id: str) -> str:
    return _geometry_key(project_id, body_id, "step")


def browser_naming_key(project_id: str, body_id: str) -> str:
    return _geometry_key(project_id, body_id, "naming.json")
