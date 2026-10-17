# Архитектура редактора

`views/EditorView.vue` — **только оркестратор**: создаёт composables редактора, раскладывает компоненты, связывает события. Вся логика живёт в `composables/editor/`, вся разметка — в компонентах этой папки. Не добавляй в EditorView ни бизнес-логику, ни крупные куски шаблона — файл уже однажды вырос до 3358 строк и был декомпозирован (см. ниже, куда что класть).

## Карта

```
EditorView.vue (оркестратор, ~580 строк)
├── composables/editor/          состояние и логика (по одному домену на файл)
│   ├── types.ts                 общие типы редактора (RenderingMode, CtxItem, …)
│   ├── useDocumentModel         производные от useDocument: sketches/bodies/timelineEntries
│   ├── useBodyMeshes            меши сцены: trackMesh/untrackMesh/replaceMesh/hydrateBodyMeshes
│   ├── useDocumentStatus        статус сохранения документа (loading/saved/…/conflict)
│   ├── useCameraSync            поллинг камеры для ViewCube + переходы вида
│   ├── useExtrudeRevolve        состояние и команды выдавливания/вращения + ghost-превью
│   ├── useQuantityField         числовое поле с выражением и единицами (lib/expr + lib/units)
│   ├── useSketchLifecycle       выбор плоскости/грани, вход-выход из эскиза, удаление
│   ├── useBooleanMode           режим CSG: выбор target/tool, apply
│   ├── useFilletChamfer         режим скругления/фаски: выбор рёбер, apply
│   ├── useThread                режим резьбы: выбор грани, призрак витков, apply
│   ├── useShell                 режим оболочки: открытые грани кликом, толщина, направление, apply
│   ├── useMirror                режим зеркала: тело, плоскость XY/XZ/YZ со смещением или грань, призрак, apply
│   ├── useSweep                 протяжка по траектории: эскизы профиля и пути, проверка пути, apply
│   ├── useHole                  режим отверстия: плоская грань, центры кликами или из эскиза, призрак, apply
│   ├── useMeasure               режим измерения: один-два объекта, запрос к ядру без записи, материал и плотность
│   ├── usePattern               режим массива: тело, ось (X/Y/Z, ребро, грань), количество, run/apply
│   ├── useStepImport            импорт STEP: выбор файла, лимиты, команда импорта, меши тел
│   ├── useParametersSync        синхронизация Параметров ↔ document.metadata
│   ├── useViewInspect           вид по нормали и меню ПКМ грани/базовой плоскости; внутри useSectionMode — сечение вьюпорта
│   ├── useEditorHotkeys         подписка на клавиатуру (логика Esc-цепочки — в EditorView)
│   ├── useTimelineEdits         удаление, подавление, маркер отката (TimelineEditCommand, отмена одним Ctrl+Z)
│   ├── useEditorControl         канал управления window.cadControl: публикация, ready, сборка операций
│   └── control/                 операции канала по доменам: чтение, вьюпорт, эскиз, операции модели
└── components/editor/           разметка + CSS Modules
    ├── EditorMenuBar            шапка: breadcrumb, статус документа, аватар
    ├── ImportStepButton         кнопка «Импорт STEP» в шапке рядом с экспортом
    ├── EditorRibbon             лента инструментов → emit action
    ├── ModelTree                дерево модели + rename (expose startRename/cancelRename)
    ├── TreeContextMenu          контекстное меню (items приходят из EditorView)
    ├── TimelineStrip            таймлайн операций, состояния записей и перетаскиваемый маркер отката
    ├── SketchDeleteDialog       предупреждение при удалении эскиза, от которого зависят операции
    ├── EditorStatusBar          нижний статус-бар
    ├── ParametersModal          модалка Параметров (состояние формы — внутри)
    ├── PropsPanelShell          каркас правой панели (head/body/foot-слоты)
    ├── SketchPropsPanel         панель режима эскиза; выбор и ховер ограничений в списке общие со значками холста (shared/useSketchConstraintFocus)
    ├── ExtrudeRevolvePanel      панель выдавливания/вращения (prop: ExtrudeRevolveApi)
    ├── BooleanPanel             панель CSG (prop: BooleanModeApi)
    ├── FilletChamferPanel       панель скругления/фаски (prop: FilletChamferApi)
    ├── EdgeSelectionList        чекбокс касательной цепочки + список выбранных рёбер с точечным снятием
    ├── ThreadPanel              панель резьбы: пресеты профиля, шаг, заходы, призрак
    ├── ShellPanel               панель оболочки: список открытых граней, толщина, внутрь/наружу
    ├── MirrorPanel              панель зеркала: плоскость, смещение, «Объединить» (prop: MirrorApi)
    ├── SweepPanel               панель «По траектории»: профиль, путь, операция, ориентация
    ├── HolePanel                панель отверстия: тип, центры, диаметр, глубина, дно, цековка/зенковка
    ├── MeasurePanel             панель измерения: фильтр элементы/тела, результаты с копированием, материал
    ├── PatternPanel             панель массива: линейный/круговой, сетка, объединить или отдельные тела
    ├── PatternAxisPicker        выбор оси массива: X/Y/Z или ребро/грань кликом
    ├── ViewportControls         кнопки вида и режима рендера
    ├── ViewInspectOverlay       панель сечения (SectionPanel) и меню ПКМ вьюпорта
    └── AxisTriad                триада осей, следит за камерой (Z-up)
```

## Правила

- **Новая фича редактора** = composable в `composables/editor/` (состояние + обработчики) + компонент здесь (разметка). В EditorView добавляется только вызов composable и тег компонента.
- **Меши сцены — только через `useBodyMeshes`.** Не зови `viewportRef.addMesh/removeMesh` напрямую из фич: рассинхрон `meshBodies` со сценой уже трижды рождал баг «результат не виден до перезагрузки». `hydrateBodyMeshes` — single-flight, параллельный вызов переиспользует текущий проход.
- **Режим** (эскиз, boolean, fillet/chamfer) — это composable с `enter()`/`exit()`, который сам управляет `viewportSelectionMode`. Взаимные выходы режимов делает только EditorView (`enterSketchMode`), сами режимы друг о друге не знают.
- **Панель получает API-объект composable целиком** (`:extrude="extrude"`), а в script деструктурирует нужные refs — иначе `vue/no-mutating-props` ругается на запись через проп.
- Composable, которому нужен доступ к сцене, принимает `viewportRef` через deps-объект; общие для редактора refs (`viewportSelectionMode`) создаёт EditorView и передаёт вниз.
- Шаблонные типы, нужные и компоненту, и EditorView, кладём в `composables/editor/types.ts` — `export type` внутри `<script setup>` не компилируется.
- **Канал управления `window.cadControl`** (e2e-драйвер, MCP) публикует `useEditorControl`; контракт и правила добавления операции — `web/src/lib/control/README.md`. Операция канала вызывает те же методы composables, что панель и лента, и ничего не кликает. Новому режиму или операции редактора нужна своя операция в `composables/editor/control/` и своё имя в `lib/control/mode.ts` — иначе драйвер и MCP их не увидят.
- Esc-цепочка приоритетов (меню → rename → выбор плоскости → эскиз → меню ПКМ вьюпорта и сечение → режимы → панель extrude → выделение) живёт в `EditorView.handleEscape` — при добавлении нового режима встрой его туда осознанно.
