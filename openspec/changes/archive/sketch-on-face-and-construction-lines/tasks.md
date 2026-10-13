# Tasks

## Backend
- [x] `SketchData.plane_offset`, `SketchInfiniteLine`, `SketchLine.construction` в Pydantic-схемах
- [x] `PLANE_BASES` в wire_builder; OCC-wire строится на плоскости с offset; фильтр construction-геометрии
- [x] Экструзия вдоль нормали плоскости от offset (OCC + fallback), symmetric через трансляцию грани
- [x] Юнит-тесты fallback-пути (`tests/test_geometry_plane.py`, 8 шт) + OCC-smoke в контейнере

## Frontend
- [x] Типы API: infline, construction, plane_offset
- [x] `useSketch`: planeOffset (set/load/save/reset)
- [x] SketchCanvas: рендер infline (штрих-пунктир, клип по вьюпорту), construction-сегментов, снэп-маркера; centerView для пустых эскизов
- [x] SketcherContainer: инструменты Паралл./Перпенд./Верт./Гориз. с фазами и вводом отступа; snapWorld (пересечения + проекции); construction исключена из selection
- [x] SketchPlaneSelector: кнопка «На грани тела…»
- [x] EditorView: face-pick режим, вычисление плоскости/offset из меша грани, проекция рёбер грани construction-сегментами, баннер с ошибкой для неосевых граней
- [x] ViewportContainer: plane-aware контуры эскизов (plane + offset), clearAllSketchOutlines
- [x] Фикс: регидрация сцены после выхода из скетчера (v-if пересоздаёт вьюпорт)
- [x] Фикс: meshBodies наполняется при гидрации
- [x] Фикс: loadSketch вызывается при входе в эскиз

## Волна 2 — «почини всё» (ревизия сомнительных механик)
- [x] Произвольный базис плоскости эскиза (`plane_basis`: origin/u/v/n) сквозь весь конвейер: wire builder, extrude, revolve (ось через базис — revolve со смещённых/наклонных плоскостей), контуры во вьюпорте
- [x] Плоскость грани определяется на сервере: `GET .../faces/{face_id}/plane` через OCC `BRepAdaptor_Surface` (+mesh-fallback), нормаль ориентируется наружу (нижняя грань выдавливается вниз), криволинейные рёбра дискретизируются
- [x] Выдавливание с операцией: `new_body | join | cut` (join/cut = fuse/cut с телом-владельцем грани, target скрывается, результат — новое тело); UI-селект «Приклеить/Вырезать/Новое тело», дефолт «Приклеить» для эскизов на грани
- [x] Ассоциативная ссылка эскиза на грань (`ref_body_id`/`ref_face_id`); regenerate помечает зависимые эскизы/фичи dirty
- [x] Фикс regenerate: перестроенный меш/brep копируется под исходный body_id в MinIO (раньше терялся после перезагрузки); regenerate join/cut явно запрещён
- [x] Выбор плоскости кликом во вьюпорте (кликабельные XY/XZ/YZ-квады у начала координат + грани тел), модальный селектор удалён
- [x] Face-selection райкастит все видимые тела (раньше — только последний добавленный меш)
- [x] Прямоугольник распадается на 4 отрезка с H/V/coincident-ограничениями
- [x] Контур упорядочивается перед построением wire (порядок рисования линий не важен)
- [x] Переключатель привязки в тулбаре скетчера; пересечения вспомогательных кэшируются (computed вместо O(n²) на mousemove)
- [x] Вьюпорт скрывается через v-show (сцена не пересоздаётся при входе в эскиз); guard нулевого resize; скетчер больше не ищет канвас через querySelector
- [x] fitAllBodies кадрирует по телам; контуры эскизов учитываются только при пустой сцене
- [x] ROADMAP идеальной CAD-системы: `.docs/ROADMAP.md`

## Качество
- [x] ESLint v9 flat-config, `npm run lint` — 0 ошибок
- [x] `npm run build` (vue-tsc) — зелёный
- [x] E2E в браузере: базовый цикл (эскиз XY → extrude), эскиз на грани (XZ + 500 мм), параллельная с отступом 20 мм, снэп прямоугольника к прямой и к пересечению, выдавливание от грани (bbox Y 500..515), персистентность после перезагрузки
