# Канал управления редактором — `window.cadControl`

Явный программный вход в редактор для e2e-драйвера (`web/e2e/helpers/cad.ts`) и MCP-сервера. Редактор публикует канал сам при монтировании `EditorView` и убирает при размонтировании; канал одинаково работает в dev и в production-сборке и не зависит от внутренностей Vue.

## Контракт (версия 1)

```ts
window.cadControl = {
  version: 1,
  ready: Promise<void>,
  request(req: ControlRequest): Promise<ControlReply>,
}

type ControlRequest = { op: string; params?: Record<string, unknown> }
type ControlReply =
  | { ok: true; op: string; result: unknown }
  | { ok: false; op: string; error: { code: ControlErrorCode; message: string } }
type ControlErrorCode =
  | "unknown_op" | "invalid_params" | "not_ready" | "busy"
  | "wrong_mode" | "not_found" | "operation_failed"
```

- `request` никогда не отклоняет промис: любая ошибка приходит ответом `ok: false`.
- Запросы и ответы — чистый JSON. Объекты Three.js, функции и refs наружу не выходят; результат обработчика прогоняется через `JSON.stringify`.
- Список операций не зашит в клиентов: его отдаёт `capabilities` — `{ version, ops: [{ op, description, mutates, params: { имя: { type, required, description } } }] }`. `type` — один из `string | number | integer | boolean | array | object`, форма массивов и объектов и вид результата описаны в `description`.
- Данных авторизации в канале нет: ни access token, ни пользователя.

## Готовность, режим, занятость

- **`ready`** разрешается один раз, когда одновременно: вьюпорт смонтирован, документ этого проекта загружен, первая загрузка тел в сцену и ядро завершена (`useBodyMeshes.hydrated`), фаза браузерного ядра — `ready`. В тот же момент на `window` летит событие `cad-control-ready`. Промис не отклоняется: если ядро не запустилось, причина видна в `state` (`kernel: "failed"`, `kernelError`).
- До готовности и при перезапуске ядра операции отвечают `not_ready` с причиной в `message`. `capabilities` и `state` доступны всегда.
- **`mode`** в `state` повторяет то, что видит пользователь в правой панели: `sketch` → `plane_pick` → `extrude`/`revolve` → `fillet`/`chamfer` → `thread` → `shell` → `mirror` → `hole` → `boolean` → `sweep` → `measure` → `model` (`mode.ts`).
- **Мутирующие операции выполняются по одной.** Вторая во время первой получает `busy`; так же отвечает запрос, пришедший, пока редактор сам занят операцией из интерфейса, сохранением или перезагрузкой тел. Операции чтения проходят всегда и видят `state.busy = true`.
- Операции модели (`extrude`, `fillet`, …) закрывают открытую панель инструмента, как это делает лента, но в открытом эскизе отвечают `wrong_mode`: эскиз нужно завершить (`sketch.finish`) или отменить (`sketch.cancel`). После операции — успешной или отклонённой ядром — редактор в режиме `model`.

## Операции

Чтение: `capabilities`, `state`, `topology`, `mesh.stats`, `scene.get`, `selection.get`, `camera.get`, `sketch.get`, `sketch.project`, `sketch.capture`, `viewport.project`, `viewport.capture`, `export`, `measure`.

`measure { targets, density? }` меряет один или два объекта (тело, грань, ребро, точка с прилипанием к вершине) по точной B-rep геометрии ядра тем же запросом, что инструмент «Измерить»: свойства каждого объекта и для пары минимальное расстояние с двумя точками, угол, межосевое и межцентровое расстояние. Режим `measure` в `state` — открыта панель инструмента; сама операция работает в любом режиме и модель не меняет.

`export { format: "step" | "stl" | "3mf", bodyIds?, quality?, tolerance?, angleDeg? }` отдаёт файл как `{ mime, filename, dataBase64 }` тем же путём, что кнопка «Экспорт» (`useExport.buildFile` → ядро). Без `bodyIds` — все видимые тела одним файлом, с `bodyIds` — ровно названные тела, и их имена попадают в имя файла: отдельный STL на каждое тело получают вызовом на каждое тело. Качество сетки STL и 3MF — пресет `quality` (`draft` | `normal` | `high`, по умолчанию `normal`, прежние 0.01 мм и 0.5 рад) либо свои `tolerance` (мм) и `angleDeg` поверх него. Пока редактор занят операцией, `export` отвечает `busy`, хотя модель не меняет.

Вид и поведение выбора без изменения документа: `camera.set`, `camera.lookAt`, `viewport.setHelpers`, `selection.setEdgeChain`.

`fillet` и `chamfer` берут ровно те рёбра, что перечислены в `edgeIds`: касательная цепочка — настройка кликов мышью (`selection.setEdgeChain`, чекбокс в панели), на операции канала она не действует. Что возьмёт клик в текущей точке, показывает `selection.get.highlightedEdges`.

Изменение модели: `sketch.start`, `sketch.addEntities`, `sketch.finish`, `sketch.cancel`, `sketch.create`, `extrude`, `revolve`, `sweep`, `fillet`, `chamfer`, `boolean`, `thread`, `shell`, `body.transform`, `body.mirror`, `hole`, `history.undo`, `history.redo`.

`shell { bodyId, faceIds, thickness, direction? }` открывает перечисленные грани и оставляет стенку `thickness` мм: `inward` (по умолчанию) — внутрь, габарит сохраняется, `outward` — наружу. Слишком толстая стенка отклоняется `operation_failed` с толщиной, которая помещается.

Параметры и вид результата — в `capabilities`.

## Где что лежит

```
lib/control/                       чистая логика, без DOM и Three.js, покрыта vitest
├── protocol.ts                    типы контракта, ControlError
├── params.ts                      описание и проверка параметров (param.*, parseParams)
├── dispatcher.ts                  реестр op, коды ошибок, ready, мутирующие по одной
├── mode.ts                        режим редактора из флагов composables
├── topology.ts                    грани и рёбра тела, проверки меша
├── cameraView.ts                  ракурс камеры из параметров
├── base64.ts                      байты → base64 для снимков и файлов экспорта
├── sketchEntities.ts              разбор сущностей эскиза, выдача id
└── measureRefs.ts                 разбор объектов измерения { bodyId, faceId | edgeId | point }

composables/editor/
├── useEditorControl.ts            собирает операции, публикует window.cadControl, следит за ready
└── control/
    ├── controlContext.ts          доступ к composables редактора, готовность, занятость
    ├── controlReadOps.ts          state, topology, mesh.stats, scene.get, selection.get
    ├── controlViewportOps.ts      камера, проекция, снимок, касательная цепочка выбора рёбер
    ├── controlSketchOps.ts        эскиз: чтение и создание
    ├── controlExportOps.ts        export: файл STEP/STL/3MF через useExport
    ├── controlMeasureOps.ts       measure: измерение через браузерное ядро
    ├── controlFeatureOps.ts       операции модели и undo/redo
    ├── controlFeatureResult.ts    общий ответ операций модели: новая запись истории
    └── controlShellOps.ts         shell: оболочка с открытыми гранями
    └── controlHoleOps.ts          hole: отверстия на плоской грани по точкам или окружностям эскиза

composables/viewport/
├── sceneProbe.ts                  проекция точек и обход сцены в JSON
└── useViewportProbe.ts            то же поверх живой сцены вьюпорта
```

## Как добавить операцию

1. `defineOp({ op, description, mutates, params, run })` в подходящем файле `composables/editor/control/`. Описание пишется для того, кто видит только его: что делает операция, что возвращает, в каком режиме доступна.
2. Обработчик вызывает существующие методы composables редактора — те же, что панели и лента. Логику операции в канале не дублируй; если методу не хватает входа без кликов (как `configureExtrude`, `selectEdge`), добавь его в composable-владелец.
3. Ошибку отдавай через `fail(code, message)`; любое другое исключение станет `operation_failed`.
4. Чистую логику (разбор параметров, геометрия) клади в `lib/control/` с тестом рядом и допиши проверку в `web/e2e/control-channel.spec.ts` или `web/e2e/control-features.spec.ts`.
