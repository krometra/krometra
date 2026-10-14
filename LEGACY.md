# LEGACY.md — известный техдолг

Живой реестр недочётов кода: крупные файлы, дублирование, обходы. Заметил новый — добавь сюда с фактами (файл, строки, чем грозит). Устранил — вычеркни в том же изменении. Приоритеты и критерии готовности — в [`.docs/ROADMAP.md`](./.docs/ROADMAP.md) (раздел «Инженерная аналитика качества»).

## Крупные файлы (не-оркестраторы, тренд вниз)

Монолитов не осталось: потолок `max-lines` (600) держит линтер без исключений.
Ближайшие к порогу файлы: `sketcher/solver/solveSketch.ts` (576),
`DashboardView.vue` (565), `EditorView.vue` (564).
Подходишь к порогу — режь по доменам, а не дописывай.

Разобрано (август–сентябрь 2026):

- `SketcherContainer.vue` 1383 → ~470 строк: домены уехали в `composables/sketcher/` (`useSketchEntities`, `useSketchSnapping`, `useAuxLines`, `useLiveDimensions`, `useEdgeDrag`, `useSketchConstraints`), разметка — в `SketcherToolbar`, `ConstraintToolbar`, `ValueInputOverlay`, `LiveDimensionsOverlay`.
- `SketchCanvas.vue` 828 → 144 строки: отрисовка — в `sketcher/renderEntities.ts` и `sketcher/renderConstraints.ts`, геометрия сущностей — в `sketcher/entityGeometry.ts`, pan/zoom/fit — в `composables/sketcher/useCanvasViewport.ts`.
- Серверное ядро pythonOCC (`backend/geometry/`, серверные операции `geometry_ops/*`, regenerate/rebuild, превью и экспорт на сервере) удалено 24.09.2026: геометрию считает только браузерное ядро OCCT/WASM, `geometry_ops/` хранит лишь сохранение browser-результатов.
- `ViewportContainer.vue` 1620 → 292 строки (коммит c262210): сцена, picking и превью — в `composables/viewport/`.
- `EditorView.vue` 640 → 564 строки (октябрь 2026): контекстное меню дерева — в `useTreeContextMenu`, видимость и цвет тела — в `useBodyPresentation`, отмена и повтор — в `useModelHistory`; файл снят с исключений `max-lines`.

## Дублирование

- **Сырые `<button>`/`<input>` вне `components/ui/`** (19 файлов в `RAW_CONTROL_DEBTORS`, `web/eslint.config.js`) при существующих `CsButton`/`CsInput`/`CsNumberInput`. Рост остановлен ESLint `vue/no-restricted-html-elements`, мигрировать попутно с декомпозицией — ROADMAP п. 8.
- **`web/src/types/api.ts`** — часть типов по-прежнему описана руками рядом с генерируемым `api.generated.ts` (`npm run gen:api`, CI-джоба `api-types`). По мере правок переводить на схему — ROADMAP п. 6.

## Обходы и особые пути

- **Спроецированные на эскиз рёбра грани — одноразовый снимок** и не обновляются при пересборке (сам эскиз за гранью следует с 13.10.2026) — ROADMAP, Фаза B.

## Процесс

- В CI (джоба `viewport-e2e`) гоняются 7 e2e-спек из 28; остальные, включая `control-channel`, `step-import` и `edge-groups`, — только локально. `bolt-and-nut` (габарит шестигранной головки) и `fillet-tears-body` (не находится ребро плиты у стойки) красные с 13.10.2026.
