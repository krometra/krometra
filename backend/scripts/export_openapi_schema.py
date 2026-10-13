"""Печатает OpenAPI-схему FastAPI-приложения в stdout, без живого стека.

Импортирует `app.main:app` напрямую и вызывает `app.openapi()` — это не
требует поднятых Postgres/Redis/MinIO (см. `lifespan` в `app/main.py`,
подключений на старте нет). Используется фронтом для генерации типов
(`web/scripts/gen-api-types.mjs`, `npm run gen:api`) и в CI, чтобы
проверить, что сгенерированные типы не разошлись со схемой.

Запуск (из каталога backend/):
    python -m scripts.export_openapi_schema > /tmp/openapi.json
"""

import json
import sys
from pathlib import Path

# Позволяет запускать модуль независимо от текущей рабочей директории.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402


def main() -> None:
    schema = app.openapi()
    json.dump(schema, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
