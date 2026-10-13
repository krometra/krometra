## 1. Конфиг и зависимости

- [ ] 1.1 Добавить MinIO/S3 SDK в `backend/requirements.txt` (`aioboto3` либо `minio`)
- [ ] 1.2 Добавить MinIO-настройки в `app/config.py` (endpoint, access key, secret, bucket, secure-флаг)
- [ ] 1.3 Прописать соответствующие переменные в `.env.example`

## 2. Хранилище (MinIO)

- [ ] 2.1 Создать `app/core/storage.py`: async-клиент, `put_object`/`get_object`/`object_exists`, инициализация bucket (idempotent)
- [ ] 2.2 Обеспечить неблокирующий доступ (async-клиент или `run_in_executor`), без блокировки event loop
- [ ] 2.3 Добавить `Depends`-провайдер клиента хранилища в `app/api/deps.py`

## 3. Модель и миграция документа

- [ ] 3.1 Создать `app/models/document.py`: таблица `documents` (`id`, `project_id` FK CASCADE + unique, `components` JSONB, `timeline` JSONB, `metadata` JSONB, `version` int, timestamps)
- [ ] 3.2 Добавить relationship `Project.document` (1:1) и зарегистрировать модель в `app/models/__init__.py`
- [ ] 3.3 Сгенерировать миграцию `make migrate-create name="add_documents"`, проверить diff (unique по `project_id`, CASCADE, JSONB-типы)
- [ ] 3.4 Применить миграцию `make migrate`

## 4. Схемы (Pydantic)

- [ ] 4.1 Создать `app/schemas/document.py`: `DocumentResponse` (`from_attributes`), `DocumentUpdate` (с `version`)
- [ ] 4.2 Создать `app/schemas/geometry.py`: `BrepTopo`, `BBox`, `MeshResponse` (`vertices`, `indices`, `brep_topo`, `bbox`)

## 5. Сервис документа

- [ ] 5.1 `app/services/document_service.py`: `get_document(db, project_id, user_id)` с изоляцией по владельцу (через проект), `404` для чужого/несуществующего
- [ ] 5.2 `save_document(...)`: optimistic locking — атомарный `UPDATE ... WHERE version = :v`, при несовпадении бросать доменный конфликт; при успехе инкремент `version`
- [ ] 5.3 Ленивое создание пустого документа при `get_document`, если его ещё нет (защита для существующих строк)
- [ ] 5.4 Обновить `project_service.create_project`: создавать пустой документ в той же транзакции

## 6. Сервис геометрии (stub-движок)

- [ ] 6.1 Создать интерфейс `GeometryEngine.tessellate()` и stub-реализацию (хардкод-куб) в `geometry/` или `app/services/geometry_engine.py`
- [ ] 6.2 Заглушка возвращает полный контракт: `vertices` (кратно 3), `indices` (кратно 3, треугольники), `brep_topo` (6 граней + рёбра), `bbox`
- [ ] 6.3 `app/services/geometry_service.py`: `get_mesh(project_id, body_id, user_id)` с изоляцией; кэш в MinIO по `{projectId}/geometry/{bodyId}.mesh` (read-through: промах → `tessellate()` → `put` → return)

## 7. Роуты

- [ ] 7.1 `GET /api/projects/{id}/document` и `PUT /api/projects/{id}/document`: тонкие роуты, `get_current_active_user`, маппинг доменных ошибок (`404`, конфликт → `409`) в `HTTPException` с `{error, error_description}`
- [ ] 7.2 `GET /api/projects/{id}/geometry/{body_id}/mesh`: тонкий роут с изоляцией, возвращает `MeshResponse`
- [ ] 7.3 Зарегистрировать роутер(ы) в `app/main.py`

## 8. Backend-тесты

- [ ] 8.1 Тест: создание проекта создаёт пустой документ; удаление проекта удаляет документ (CASCADE)
- [ ] 8.2 Тесты изоляции: чужой пользователь получает `404` на document и mesh
- [ ] 8.3 Тесты optimistic locking: успешный `PUT` инкрементирует `version`; устаревший `version` → `409`, данные не меняются
- [ ] 8.4 Тест mesh-кэша: первый запрос генерирует и кладёт блоб, повторный отдаёт из хранилища без повторной генерации

## 9. Frontend: типы и состояние

- [ ] 9.1 `web/src/types/api.ts`: типы `Document`, `MeshData`, `BrepTopo`, `BBox` (синхронно с Pydantic)
- [ ] 9.2 `composables/shared/useDocument.ts` (createSharedComposable): `document`, `version`, `isDirty`, `conflict`, `load(projectId)`, `save()`; обработка `409` (не сбрасывать `isDirty`, выставлять `conflict`)
- [ ] 9.3 `composables/useAutoSave.ts`: таймер 30с + `watch(isDirty)` → `save()`; не сохранять, если не dirty; очистка таймера при unmount

## 10. Frontend: редактор и viewport

- [ ] 10.1 `ViewportContainer.vue`: метод `addMesh(meshData)` — строит `THREE.BufferGeometry` из `vertices`/`indices`, добавляет в сцену; хранит ссылки для очистки
- [ ] 10.2 `ViewportContainer.vue`: в `onUnmounted` — `dispose` геометрий/материалов добавленных мешей (в дополнение к существующей очистке renderer/controls/RAF)
- [ ] 10.3 `EditorView.vue`: при mount грузить документ через `useDocument`, запрашивать меш тела, отдавать в `addMesh`; подключить `useAutoSave`
- [ ] 10.4 `EditorView.vue`: показывать состояние сохранения/версию и уведомлять о конфликте (через `CsToast` или индикатор), мягко обрабатывать ошибку загрузки

## 11. Проверки и завершение

- [ ] 11.1 `npm run build` (vue-tsc) и `npm run lint` зелёные
- [ ] 11.2 Backend-тесты проходят
- [ ] 11.3 Ручная проверка end-to-end: создать проект → открыть редактор → виден куб → правка документа → авто-сейв через 30с → перезагрузка сохраняет состояние
- [ ] 11.4 `openspec validate add-document-persistence --strict` без ошибок
