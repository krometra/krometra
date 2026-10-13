# CLAUDE.md

Руководство для Claude Code при работе в этом репозитории.

## О проекте

**Крометра** — браузерная инженерная CAD-система для параметрического 3D-моделирования (аналог Fusion 360 / Onshape). Геометрическое ядро и рендеринг — в браузере, ничего не нужно устанавливать. Лицензия FSL-1.1-ALv2 (source-available: код открыт, конкурирующий продукт на нём строить нельзя; каждая версия через 2 года переходит в Apache 2.0).

Browser-first: точное B-rep ядро OpenCASCADE, собранное в WebAssembly (`replicad-opencascadejs`), работает в Web Worker (`web/src/workers/browser-geometry.worker.ts`, операции — в `web/src/workers/geometry/`). Worker строит тела, отдаёт тесселяцию во вьюпорт и STEP для хранения. Backend — только авторизация, проекты, документ и файловое хранилище (STEP, меш, превью); геометрию он не строит и не разбирает. Серверного ядра и серверного fallback нет; проекты, построенные старым серверным ядром, редактор не открывает.

Реализованы: монорепо, аутентификация (OAuth2 password flow, rate limiting), CRUD проектов с изоляцией по пользователю, браузерное B-rep ядро OCCT/WASM (выдавливание с приклеиванием/вырезом на расстояние, насквозь, до грани/тела, в обе стороны; вращение; булевы; скругление и фаска; резьба; экспорт STEP/STL; стабильные имена граней/рёбер), скетчер с ограничениями, timeline операций, превью проектов снимком вьюпорта. Актуальный план — `.docs/ROADMAP.md`, продуктовый scope — `.docs/gdd.md`.

**`.docs/gdd.md`** — главный источник истины по продукту, архитектуре, scope MVP и плану развития. Читай его перед любыми крупными изменениями.

## Структура репозитория

Монорепо: `backend/` (Python/FastAPI) + `web/` (Vue 3/TypeScript), оркестрация через `docker-compose.yml`.

```
backend/         FastAPI, SQLAlchemy (async), Alembic
  app/
    api/routes/  auth.py, projects.py (+ превью), documents.py, sketches.py, geometry.py (browser-*)
    core/        database.py, security.py (OAuth2/JWT/bcrypt), rate_limit.py, storage.py (MinIO)
    models/      SQLAlchemy-модели (user, project, document, refresh_token, oauth_account)
    schemas/     Pydantic-схемы
    services/    бизнес-логика (auth, project, document, thumbnail);
                 geometry_ops/ — приём результатов браузерного ядра: контракт меша, STEP, target_resolution
  alembic/       миграции БД
web/
  src/
    views/       страницы-роуты (Dashboard, Editor, Login, Register)
    components/   ui/ (дизайн-система Cs*), viewport/ (Three.js), editor/, sketcher/
    composables/  useApi.ts; shared/ — глобальное состояние (createSharedComposable);
                  editor/ — домены редактора (useBrowserGeometry — клиент worker'а ядра);
                  viewport/ — домены 3D-вьюпорта
    workers/     browser-geometry.worker.ts — OCCT/WASM ядро; geometry/ — операции worker'а
    lib/         чистая логика без DOM (browserKernel.ts — лимиты памяти и перезапуск ядра;
                 control/ — протокол канала управления редактором window.cadControl)
    bench/       бенчмарки производительности (vitest bench), в npm test не входят
    router/      Vue Router + auth guards
    styles/      CSS-переменные дизайн-системы
  mcp/           MCP-сервер: управление живым редактором через window.cadControl
```

## Стек

**Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async + asyncpg), PostgreSQL 16, Redis, Alembic, bcrypt, PyJWT, MinIO (STEP, меши и превью проектов). Геометрических зависимостей (pythonOCC, numpy) нет.

**Frontend:** Vue 3 (Composition API) + TypeScript, Three.js (вьюпорт), OCCT/WASM через `replicad` в Web Worker (WASM ~23 МБ, ~7 МБ в gzip, кэшируется навсегда по хешу в имени), Vue Router, zag.js (headless UI) + CSS Modules (своя дизайн-система, **без Tailwind/Radix**), state через `createSharedComposable` из VueUse (**не Pinia**).

## Команды

```bash
make up            # поднять весь стек (postgres, redis, minio, backend)
make down          # остановить
make rebuild       # пересобрать образы и поднять заново (фронт собирается внутри образа web)
make rebuild-front # пересобрать только web; make rebuild-back — только app
make front         # локальная сборка web/dist без Docker (vue-tsc + vite)
make logs          # логи docker compose
make migrate       # alembic upgrade head (внутри контейнера app)
make migrate-create name="описание"   # автогенерация миграции
make db-shell      # psql в контейнере postgres
make clean         # down -v + очистка кэшей

# Локально без Docker:
make backend-shell    # pip install + uvicorn --reload :8000
make frontend-shell   # npm install + vite dev :5173

# Frontend (из web/):
npm run build      # check:size + vue-tsc --noEmit + vite build  (размер файлов + типы + сборка)
npm run check:size # eslint: предупреждает о файлах > 600 строк
npm run lint       # eslint --max-warnings 0 (гейт в CI)
npm run gen:api    # перегенерировать src/types/api.generated.ts из OpenAPI backend
npm run bench         # бенчмарки ядра, вьюпорта и скетчера (vitest bench, src/bench/); в npm test не входят
npm run bench:smoke   # те же бенчмарки по одной итерации, секунды: проверить, что они живы
npm run bench:save    # полный прогон + локальная база bench-results/baseline.json (в .gitignore)
npm run bench:compare # полный прогон против базы; каталог метрик и чтение таблицы — src/bench/README.md
npm run mcp           # MCP-сервер управления редактором через window.cadControl (stdio); подключение — mcp/README.md
npm run test:mcp      # тесты MCP-сервера на странице-заглушке (нужен Chromium от Playwright, стек не нужен)

# Backend (из backend/): pytest
```

Health-check: `GET /api/health`. Vite проксирует `/api` → `http://localhost:8000`.

## Конвенции

- **Комментарии:** минимум, в идеале без них. Имена и маленькие функции должны объяснять код сами. Комментарий — только когда *почему* нельзя выразить кодом (обход, gotcha, внешнее ограничение).
- **Backend:** всё async (роуты, сервисы, DB-сессии). Роуты тонкие — логика в `services/`. Доступ к БД только через `Depends(get_db)`. Ошибки домена бросаются как `AuthError`/`ProjectError` и маппятся в `HTTPException` в роуте.
- **Изоляция данных:** любой запрос к ресурсам проекта фильтруется по `owner_id == current_user.id`. Никогда не отдавай чужие данные.
- **Безопасность токенов:** access token (JWT, 15 мин) — только в памяти JS, в `Authorization: Bearer`. Refresh token (opaque, 30 дней) — только в httpOnly Secure SameSite cookie, **никогда** в localStorage. Ротация + family tracking в Redis (см. `core/security.py`).
- **Frontend state:** глобальное состояние — это обычный composable, обёрнутый в `createSharedComposable` (`composables/shared/`). Не вводи Pinia.
- **UI:** новые интерактивные компоненты строятся на zag.js + CSS Modules с токенами `--cs-*`. Префикс компонентов дизайн-системы — `Cs` (`CsButton`, `CsDialog`, …).
- **Three.js** используется напрямую через template ref, без оберток вроде TresJS, чтобы держать тонкий контроль над render loop.
- **Геометрия — только в браузерном ядре.** Новая операция — сообщение worker'а + `Browser*Command` + эндпоинт `browser-*`, сохраняющий STEP и меш без разбора. Worker держит тела между командами; `useBrowserGeometry` следит за памятью (лимит модели, перезапуск worker'а с повторной гидрацией тел после OOM/abort). Неподдержанная операция недоступна, молчаливого серверного fallback нет.

## Размер файла — жёсткое правило

Репозиторий дважды платил за файлы-монолиты: `EditorView.vue` дорос до 3358 строк, `ViewportContainer.vue` — до 1620, и почти все баги рассинхрона сцены, picking'а и системы координат жили именно там. Оба разобраны (580 и 292 строки). Чтобы это не повторилось:

- **Потолок — 600 строк на файл**, гейтится ESLint-правилом `max-lines`: превышение видно в `npm run build` (шаг `check:size`) и валит `npm run lint` (`--max-warnings 0`). Приблизился — останавливайся и режь по доменам, а не «допишу ещё немного». Список файлов-должников в `eslint.config.js` только сокращается — новые туда не добавляются.
- **Компонент-контейнер это оркестратор:** props/emits, разметка, связывание composables, экспорт API. Логики в нём быть не должно.
- **Один домен — один composable** в `composables/<область>/` (образцы: `composables/editor/`, `composables/viewport/`). Домен владеет своим состоянием: мутируют и сбрасывают его только методы этого composable, снаружи — никаких правок чужих refs.
- **Чистую логику выноси отдельным модулем без Three.js/DOM** (`lib/pickPriority.ts`, `composables/viewport/edgePicking.ts`) — тогда она покрывается vitest без браузера. Новая нетривиальная логика без юнит-теста не считается готовой.
- **Одна функция — одно действие.** Не совмещай два поведения опциональными аргументами.
- **Копируешь функцию и меняешь два слова — выноси общее.** Симметричные варианты (цель/инструмент, set/reset, показать/скрыть) делаются параметром, а не второй копией.
- **Мёртвый код, стили и импорты удаляются в том же изменении**, а не «потом».
- Актуальный реестр крупных файлов и техдолга — [`LEGACY.md`](./LEGACY.md); увидел новый монолит — впиши туда.

## Перед коммитом

- Backend: убедись, что миграция создана, если менял модели (`make migrate-create`).
- Frontend: `npm run build` должен проходить (размер файлов + vue-tsc) и `npm run lint` без ошибок и warnings.
- Коммить/пушь только по явной просьбе пользователя.
