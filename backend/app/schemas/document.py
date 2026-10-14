"""Document schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.ids import is_body_id, is_component_id

BODY_REFERENCE_FIELDS = ("body_id", "result_body_id", "target_body_id", "tool_body_id", "up_to_body_id")
COMPONENT_REFERENCE_FIELDS = ("id", "sketch_id", "feature_key")


class DocumentResponse(BaseModel):
    id: str
    project_id: str
    components: dict = Field(default_factory=dict)
    timeline: list = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict, validation_alias="doc_metadata")
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _check_references(record: dict, where: str) -> None:
    for field in BODY_REFERENCE_FIELDS:
        value = record.get(field)
        if value is not None and not is_body_id(value):
            raise ValueError(f"{where}: некорректный идентификатор тела в поле {field}.")
    for field in COMPONENT_REFERENCE_FIELDS:
        value = record.get(field)
        if value is not None and not is_component_id(value):
            raise ValueError(f"{where}: некорректный идентификатор в поле {field}.")


def _check_component(key: object, component: object) -> None:
    if not is_component_id(key):
        raise ValueError("Ключ компонента должен состоять из латиницы, цифр, '-' или '_' (до 64 символов).")
    if not isinstance(component, dict):
        raise ValueError(f"Компонент {key} должен быть объектом.")
    if component.get("type") == "body" and not is_body_id(key):
        raise ValueError(f"Тело {key} должно иметь идентификатор вида body-<12 hex>.")
    source = component.get("source")
    if isinstance(source, dict):
        _check_references(source, f"Компонент {key}")


def _check_timeline_entry(entry: object) -> None:
    if not isinstance(entry, dict):
        raise ValueError("Запись истории должна быть объектом.")
    _check_references(entry, "История")
    params = entry.get("params")
    if params is not None and not isinstance(params, dict):
        raise ValueError("Параметры записи истории должны быть объектом.")
    _check_references(params or {}, "История")


class DocumentVersionResponse(BaseModel):
    version: int


class DocumentUpdate(BaseModel):
    components: Optional[dict] = None
    timeline: Optional[list] = None
    metadata: Optional[dict] = None
    version: int

    @field_validator("components")
    @classmethod
    def _valid_components(cls, components: dict | None) -> dict | None:
        for key, component in (components or {}).items():
            _check_component(key, component)
        return components

    @field_validator("timeline")
    @classmethod
    def _valid_timeline(cls, timeline: list | None) -> list | None:
        for entry in timeline or []:
            _check_timeline_entry(entry)
        return timeline
