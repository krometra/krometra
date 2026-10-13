"""Форматы идентификаторов, из которых строятся ключи хранилища и ссылки документа."""

import re

COMPONENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
BODY_ID_PATTERN = re.compile(r"^body-[0-9a-f]{12}$")


def is_component_id(value: object) -> bool:
    return isinstance(value, str) and COMPONENT_ID_PATTERN.fullmatch(value) is not None


def is_body_id(value: object) -> bool:
    return isinstance(value, str) and BODY_ID_PATTERN.fullmatch(value) is not None
