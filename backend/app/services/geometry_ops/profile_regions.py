"""Выбранные регионы профиля выдавливания и вращения: ключи от браузерного ядра."""

import json
import re

from fastapi import HTTPException, status

MAX_PROFILE_REGIONS = 256
_REGION_KEY = re.compile(r"^[A-Za-z0-9~_-]{1,64}$")


def _invalid() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"error": "invalid_profile_regions", "error_description": "Некорректный список регионов профиля."},
    )


def parse_profile_regions(value: str | None) -> list[str]:
    if value is None or value == "":
        return []
    try:
        keys = json.loads(value)
    except json.JSONDecodeError:
        raise _invalid() from None
    if not isinstance(keys, list) or len(keys) > MAX_PROFILE_REGIONS:
        raise _invalid()
    if not all(isinstance(key, str) and _REGION_KEY.match(key) for key in keys):
        raise _invalid()
    return list(dict.fromkeys(keys))


def profile_region_params(keys: list[str] | None) -> dict:
    return {"profile_regions": keys} if keys else {}
