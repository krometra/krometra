> Заархивировано 19.08.2026: срез «документ → меш → viewport» реализован другим путём (см. историю master). 0/37 задач формально, фактически функциональность есть.

## Why

Сейчас `Project` — это только метаданные (имя, описание, превью). У проекта нет CAD-данных: `EditorView` даже не загружает проект, а 3D-viewport рисует лишь сетку. Заявленный «Phase 1 Foundation» на деле не закрыт — нет ни документ-модели (ядро CAD-данных по `gdd.md` §6.4), ни авто-сейва, ни загрузки меша в viewport.

Этот срез замыкает **трубу данных насквозь**: пустой проект → сохраняемый документ → меш на экране. Геометрию пока считать нечем (OpenCASCADE — отдельная большая работа, thread C), поэтому меш — заглушка за тем же интерфейсом, который позже реализует ядро. Цель — чтобы persistence-, mesh-транспорт- и render-плумбинг были настоящими и работающими, и OCCT встал *внутрь* готового конвейера, а не потребовал переписать половину.

## What Changes

- Новая таблица `documents` (1:1 с `projects`, `ondelete CASCADE`): `components`/`timeline`/`metadata` как JSONB-конверт + `version` для optimistic locking. Пустой документ создаётся при создании проекта.
- Эндпоинты `GET`/`PUT /api/projects/{id}/document` — загрузка и сохранение документа с проверкой `version` (конфликт → `409`), изоляция по `owner_id`.
- Эндпоинт `GET /api/projects/{id}/geometry/{body_id}/mesh` — отдаёт меш в контракте `gdd.md` §5.2: `{ vertices, indices, brepTopo: { faces, edges }, bbox }`.
- `GeometryEngine.tessellate()` — интерфейс со **stub-реализацией** (хардкод-куб); шов, который позже займёт OCCT. Меш кэшируется в MinIO при первом запросе.
- Подключение MinIO: клиент хранилища (`core/storage.py`), инициализация bucket, путь `{projectId}/geometry/{bodyId}.mesh`.
- Frontend: `useDocument` (createSharedComposable) — один открытый документ, load/save, `isDirty`, `version`, обработка конфликта; `useAutoSave` — таймер 30с + watch `isDirty`.
- `EditorView` грузит документ и меш при монтировании, показывает состояние сохранения; `ViewportContainer.addMesh()` строит `THREE.BufferGeometry` и освобождает ресурсы в `onUnmounted`.

Не входит (явно вне scope): реальная геометрия/OCCT, скетчер, реальные фичи и операции timeline, экспорт STEP/STL, `project_members`/sharing, интерактивная селекция граней (`brepTopo` передаётся, но selection — позже).

## Capabilities

### New Capabilities
- `project-document`: документ-модель проекта (тонкий JSONB-конверт `components`/`timeline`/`metadata`), его создание вместе с проектом, загрузка/сохранение с изоляцией по владельцу, optimistic locking по `version`, авто-сейв по таймеру.
- `geometry-mesh`: контракт транспорта тесселированного меша (`vertices`/`indices`/`brepTopo`/`bbox`), stub-движок геометрии за интерфейсом `tessellate()`, хранение и кэш меш-блобов в MinIO, отображение меша в Three.js-viewport.

### Modified Capabilities
<!-- Нет изменений требований к существующим спекам: в openspec/specs/ пусто. -->

## Impact

- **Backend:** новые `models/document.py`, `schemas/document.py`, `schemas/geometry.py`, `services/document_service.py`, `services/geometry_service.py`, `core/storage.py` (MinIO), `api/routes/documents.py` (или расширение `projects.py`), Alembic-миграция `documents`. Правка `project_service.create_project` (создание пустого документа). Регистрация роутов в `main.py`.
- **Frontend:** новые `composables/shared/useDocument.ts`, `composables/useAutoSave.ts`; правки `views/EditorView.vue`, `components/viewport/ViewportContainer.vue`, `types/api.ts`.
- **Зависимости:** добавить MinIO SDK (`minio` или `boto3`/`aioboto3`) в `backend/requirements.txt`. MinIO-контейнер уже есть в `docker-compose.yml`; нужны env-переменные доступа в `config.py`/`.env.example`.
- **Контракт:** новые публичные эндпоинты документа и меша; формат меша становится зафиксированным контрактом, который реализует будущее ядро (thread C).
