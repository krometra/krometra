> Заархивировано 19.08.2026: boolean-операции реализованы (кнопка «Комбинировать», `geometry/boolean.py`, `tests/test_boolean.py`). Спека жила в `.docs/` до появления OpenSpec-процесса.

# Инкремент: Boolean Operations (CSG)

> **Статус:** Спецификация  
> **Дата:** 2026-07-07  
> **Автор:** Аналитик (agent analyst-cad-boolean)  
> **Версия GDD:** v0.3  
> **Приоритет:** P0 (MVP)

---

## 1. Обзор

### 1.1 Что нужно реализовать

Поддержка трёх CSG-операций над 3D-телами:

| Операция   | OCCT класс           | Семантика                        |
|------------|----------------------|----------------------------------|
| **Union**  | `BRepAlgoAPI_Fuse`   | Объединение двух тел в одно      |
| **Subtract**| `BRepAlgoAPI_Cut`  | Вычитание одного тела из другого |
| **Intersect**| `BRepAlgoAPI_Common`| Пересечение — общая часть тел    |

### 1.2 Контекст

Boolean operations указаны в GDD как P0 и уже заложены в модель данных:
```typescript
// GDD §6.6 — уже определённый тип
interface BooleanFeature {
  type: "boolean";
  operation: "union" | "subtract" | "intersect";
  targetBodyId: string;
  toolBodyIds: string[];
}
```

В текущем коде extrude уже создаёт тела с типом `"type": "body"` и сохраняет их в `document.components`.

### 1.3 Что НЕ входит в этот инкремент

- **Timeline/история операций** — будет отдельным инкрементом. Результат boolean-операции сохраняется как компонент в `document.components`, но запись в `document.timeline` не делается.
- **Undo/Redo** — отдельный инкремент.
- **Multi-body boolean** (больше двух тел) — MVP только бинарные операции.

---

## 2. API Design

### 2.1 Единый endpoint vs три отдельных

**Решение: один универсальный endpoint** с параметром `operation`.

Причины:
- Единообразная схема запроса/ответа (меняется только operation)
- Проще валидация на бэкенде
- Легче расширять новыми operation в будущем
- Меньше дублирования кода в клиенте

### 2.2 Endpoint

```
POST /api/projects/{project_id}/geometry/boolean
```

**Тело запроса:**

```json
{
  "operation": "union",
  "target_body_id": "body-1a2b3c4d5e6f",
  "tool_body_id": "body-6f5e4d3c2b1a"
}
```

**Успешный ответ (200):**

```json
{
  "result_body_id": "body-7g8h9i0j1k2l",
  "mesh": {
    "vertices": [...],
    "indices": [...],
    "brep_topo": {...},
    "bbox": {...},
    "face_triangle_map": [...]
  }
}
```

**Ответ при ошибке (пустой результат):**

```json
{
  "error": "empty_result",
  "error_description": "Boolean operation produced empty result: bodies do not intersect."
}
```

### 2.3 Семантика параметров

| Параметр         | Описание                                                                 |
|------------------|--------------------------------------------------------------------------|
| `operation`      | `"union"`, `"subtract"`, или `"intersect"`                              |
| `target_body_id` | Тело, к которому применяется операция (при subtract — из него вычитают) |
| `tool_body_id`   | Тело-инструмент (при subtract — то, что вычитают)                       |

> **Примечание по именованию.** Используем `target`/`tool` вместо `body_a`/`body_b` чтобы семантика была ясна: target — «основное» тело, tool — «инструмент». Для union порядок не важен (коммутативно), для subtract принципиален.

### 2.4 Путь к мешам исходных тел

Меши загружаются из MinIO по ключам:
```
{project_id}/geometry/{target_body_id}.mesh
{project_id}/geometry/{tool_body_id}.mesh
```

Сами OCCT-формы (`TopoDS_Shape`) в MVP не кешируются — boolean выполняется через меш. Это означает, что для MVP boolean реализуется на основе закешированных мешей, а не напрямую через OCCT.

> **⚠️ Важное решение для MVP:** Поскольку pythonocc-core доступен только внутри Docker-контейнера (conda-forge), а на хосте используется mesh-fallback, реализуем **два пути** как и в extrude:
> 1. **OCCT-путь** (внутри Docker): загружаем TopoDS_Shape из .brep-файлов в MinIO (см. ниже), выполняем BRepAlgoAPI_Fuse/Cut/Common, тесселируем результат.
> 2. **Fallback-путь** (хост без OCCT): используем трёхстороннюю библиотеку для булевых операций на мешах (например, `manifold3d` или `pymeshlab`) — или возвращаем понятную ошибку "OCCT required for boolean operations".
>
> **Рекомендация для MVP:** хранить OCCT-формы в MinIO как `.brep` рядом с `.mesh`. При extrude сохранять оба. При boolean — загружать `.brep`, выполнять операцию, сохранять результат `.brep` + `.mesh`. Это требует **изменения extrude для сохранения .brep** (см. §3.1).

---

## 3. Модель данных

### 3.1 Хранение тела в document.components

**Текущий формат тела (после extrude):**
```json
{
  "body-1a2b3c4d5e6f": {
    "type": "body",
    "source_sketch": "sketch-abc",
    "operation": "new_body",
    "distance": 20.0,
    "direction": "one_side"
  }
}
```

**Нужно расширить до:**
```json
{
  "body-1a2b3c4d5e6f": {
    "type": "body",
    "source": {
      "kind": "extrude",
      "sketch_id": "sketch-abc",
      "distance": 20.0,
      "direction": "one_side"
    },
    "bbox": {
      "min": [0.0, 0.0, 0.0],
      "max": [10.0, 10.0, 20.0]
    }
  }
}
```

> **Изменение:** `source_sketch` + `operation` + `distance` + `direction` заменяются на вложенный объект `source` с полем `kind`. Это не ломает обратную совместимость — старые документы без поля `source` просто не будут участвовать в boolean до перегенерации. Однако для упрощения MVP рекомендуем применить миграцию формата в том же PR (изменения только в коде, не в БД).

**Новый формат тела — результат boolean:**

```json
{
  "body-7g8h9i0j1k2l": {
    "type": "body",
    "source": {
      "kind": "boolean",
      "operation": "union",
      "target_body_id": "body-1a2b3c4d5e6f",
      "tool_body_id": "body-6f5e4d3c2b1a"
    },
    "bbox": {
      "min": [0.0, 0.0, 0.0],
      "max": [15.0, 12.0, 25.0]
    }
  }
}
```

### 3.2 Поле `visible` для управления отображением

Добавляем опциональное поле `visible` в метаданные тел:

```json
{
  "body-1a2b3c4d5e6f": {
    "type": "body",
    "source": { "kind": "extrude", ... },
    "visible": false,
    "bbox": { ... }
  }
}
```

**Семантика:**
- `visible` отсутствует → `true` (по умолчанию)
- `visible: false` → тело не отображается на клиенте
- После boolean-операции исходные тела получают `visible: false` по умолчанию (опционально — см. §6)

### 3.3 Полная схема `document.components` на выходе инкремента

```typescript
// Виды источников тел
type BodySource =
  | { kind: "extrude"; sketch_id: string; distance: number; direction: "one_side" | "symmetric" }
  | { kind: "boolean"; operation: "union" | "subtract" | "intersect"; target_body_id: string; tool_body_id: string };

interface BodyComponent {
  type: "body";
  source: BodySource;
  visible?: boolean;  // default: true
  bbox?: { min: [number, number, number]; max: [number, number, number] };
}

interface SketchComponent {
  type: "sketch";
  plane: "XY" | "XZ" | "YZ";
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

type Component = BodyComponent | SketchComponent;
// components: Record<string, Component>
```

---

## 4. Бэкенд-реализация

### 4.1 Файлы, которые нужно изменить/создать

| Файл | Действие | Описание |
|------|----------|----------|
| `backend/geometry/engine.py` | Изменить | Добавить метод `make_boolean()` |
| `backend/geometry/boolean.py` | **Создать** | Модуль булевых операций (OCCT + fallback) |
| `backend/app/schemas/geometry.py` | Изменить | Добавить `BooleanRequest`, `BooleanResponse` |
| `backend/app/services/geometry_service.py` | Изменить | Добавить `boolean_operation()`, изменить `extrude_sketch()` для сохранения .brep |
| `backend/app/api/routes/geometry.py` | Изменить | Добавить POST `/boolean` endpoint |
| `backend/app/schemas/document.py` | Без изменений | `components: dict` — не меняется |
| `backend/geometry/extrude.py` | Без изменений | (возвращает форму/меш как раньше) |
| `backend/tests/test_boolean.py` | **Создать** | Тесты |

### 4.2 Модуль `backend/geometry/boolean.py`

```python
"""
Boolean (CSG) operations using OCCT.

Operations:
  - union:  BRepAlgoAPI_Fuse (A ∪ B)
  - subtract: BRepAlgoAPI_Cut (A - B)
  - intersect: BRepAlgoAPI_Common (A ∩ B)
"""

try:
    from OCC.Core.BRepAlgoAPI import (
        BRepAlgoAPI_Fuse,
        BRepAlgoAPI_Cut,
        BRepAlgoAPI_Common,
    )
    from OCC.Core.TopoDS import TopoDS_Shape
    from OCC.Core.BRep import BRep_Builder
    from OCC.Core.BRepTools import breptools_Read, breptools_Write
    _HAS_OCC_BOOLEAN = True
except ImportError:
    _HAS_OCC_BOOLEAN = False


OPERATION_MAP = {
    "union": "fuse",
    "subtract": "cut",
    "intersect": "common",
}


def make_boolean_occ(shape_a, shape_b, operation: str) -> tuple:
    """
    Execute boolean operation using OCCT.

    Args:
        shape_a: Target TopoDS_Shape.
        shape_b: Tool TopoDS_Shape.
        operation: "union", "subtract", or "intersect".

    Returns:
        (result_shape: TopoDS_Shape, is_empty: bool)
    """
    if operation == "union":
        algo = BRepAlgoAPI_Fuse(shape_a, shape_b)
    elif operation == "subtract":
        algo = BRepAlgoAPI_Cut(shape_a, shape_b)
    elif operation == "intersect":
        algo = BRepAlgoAPI_Common(shape_a, shape_b)
    else:
        raise ValueError(f"Unknown boolean operation: {operation}")

    algo.Build()

    if not algo.IsDone():
        raise RuntimeError(f"Boolean {operation} failed: builder not done")

    result = algo.Shape()
    # Check if result is empty/null
    is_empty = result.IsNull()

    return result, is_empty


def make_boolean(shape_a, shape_b, operation: str) -> tuple:
    """
    Execute boolean operation. Returns (result_shape, is_empty).

    Falls back to error if OCCT is not available.
    """
    if _HAS_OCC_BOOLEAN:
        return make_boolean_occ(shape_a, shape_b, operation)
    else:
        raise RuntimeError(
            "pythonocc-core is required for boolean operations. "
            "Run the backend inside the Docker container with conda-forge OCCT."
        )
```

### 4.3 Метод `OCCEngine.make_boolean()`

Добавить в `backend/geometry/engine.py`:

```python
def make_boolean(
    self,
    shape_a,       # TopoDS_Shape (target)
    shape_b,       # TopoDS_Shape (tool)
    operation: str, # "union" | "subtract" | "intersect"
) -> dict:
    """
    Execute boolean operation between two shapes.

    Returns:
        dict with mesh data (same format as make_solid_from_extrude)
        or raises ValueError if result is empty.
    """
    from geometry.boolean import make_boolean as _boolean_op

    result_shape, is_empty = _boolean_op(shape_a, shape_b, operation)

    if is_empty:
        raise ValueError("Boolean operation produced empty result.")

    # Tessellate result
    mesh = tessellate_shape(result_shape)
    return mesh
```

### 4.4 Сохранение .brep при extrude (изменение в `geometry_service.py`)

В методе `extrude_sketch()` нужно сохранять OCCT-форму в MinIO рядом с мешем:

```python
# В extrude_sketch() после создания solid:
# (если доступен OCCT)

# Сохраняем .brep
from geometry.engine import HAS_OCC
if HAS_OCC:
    brep_key = f"{project_id}/geometry/{body_id}.brep"
    brep_blob = engine._encode_brep(solid)  # новый метод
    await storage.put_object(brep_key, brep_blob, "application/octet-stream")
```

Добавить метод в OCCEngine:

```python
def _encode_brep(self, shape) -> bytes:
    """Encode TopoDS_Shape to BRep binary format."""
    from OCC.Core.BRepTools import breptools_Write
    from OCC.Core.BRep import BRep_Builder
    import io
    buf = io.BytesIO()
    # ... write brep to buf ...
    return buf.getvalue()

@staticmethod
def _decode_brep(data: bytes):
    """Decode binary BRep data to TopoDS_Shape."""
    # ...
```

### 4.5 Сервис `boolean_operation()` в `geometry_service.py`

```python
async def boolean_operation(
    project_id: str,
    operation: str,
    target_body_id: str,
    tool_body_id: str,
    user_id: str,
    db: AsyncSession,
    storage: AsyncStorageClient,
) -> dict:
    """
    Execute boolean operation between two bodies.

    1. Verify project ownership
    2. Load bodies from document.components (validate they exist, type=body)
    3. Load .brep shapes from MinIO
    4. Execute boolean operation via OCCEngine
    5. Tessellate result
    6. Save result .brep + .mesh to MinIO
    7. Add result body to document.components
    8. Optionally hide source bodies (visible=false)
    9. Return result
    """
    import uuid as _uuid

    # 1. Verify ownership
    from app.services.document_service import get_document
    doc = await get_document(db, project_id, user_id)
    components = dict(doc.components or {})

    # 2. Validate bodies
    target = components.get(target_body_id)
    tool = components.get(tool_body_id)

    if not target or target.get("type") != "body":
        raise HTTPException(status_code=404, detail={
            "error": "body_not_found",
            "error_description": f"Target body '{target_body_id}' not found or not a body."
        })
    if not tool or tool.get("type") != "body":
        raise HTTPException(status_code=404, detail={
            "error": "body_not_found",
            "error_description": f"Tool body '{tool_body_id}' not found or not a body."
        })

    # 3. Load .brep shapes from MinIO
    target_brep_key = f"{project_id}/geometry/{target_body_id}.brep"
    tool_brep_key = f"{project_id}/geometry/{tool_body_id}.brep"

    if not await storage.object_exists(target_brep_key):
        raise HTTPException(status_code=400, detail={
            "error": "brep_not_found",
            "error_description": f"BRep data for body '{target_body_id}' not found. Bodies must be created in the Docker container (OCCT)."
        })
    if not await storage.object_exists(tool_brep_key):
        raise HTTPException(status_code=400, detail={
            "error": "brep_not_found",
            "error_description": f"BRep data for body '{tool_body_id}' not found."
        })

    target_brep = OCCEngine._decode_brep(await storage.get_object(target_brep_key))
    tool_brep = OCCEngine._decode_brep(await storage.get_object(tool_brep_key))

    # 4-5. Execute boolean + tessellate
    engine = OCCEngine()
    try:
        mesh_data = engine.make_boolean(target_brep, tool_brep, operation)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={
            "error": "empty_result",
            "error_description": str(e),
        })

    # 6. Save result
    result_body_id = f"body-{_uuid.uuid4().hex[:12]}"

    # Mesh
    mesh_key = f"{project_id}/geometry/{result_body_id}.mesh"
    mesh_blob = json.dumps(mesh_data).encode("utf-8")
    await storage.put_object(mesh_key, mesh_blob, "application/json")

    # BRep (from engine — need to get the shape back)
    # Option A: make_boolean returns (mesh, shape) tuple
    # Option B: re-fetch from mesh — not feasible
    # Решение: изменить make_boolean чтобы возвращать (mesh, shape)

    # Compute bbox from mesh
    bbox = mesh_data.get("bbox", {"min": [0,0,0], "max": [0,0,0]})

    # 7. Add result body to document.components
    components[result_body_id] = {
        "type": "body",
        "source": {
            "kind": "boolean",
            "operation": operation,
            "target_body_id": target_body_id,
            "tool_body_id": tool_body_id,
        },
        "visible": True,
        "bbox": bbox,
    }

    # 8. Hide source bodies (см. §6 — UX-решение)
    # По умолчанию: прячем исходные тела
    components[target_body_id] = {**target, "visible": False}
    components[tool_body_id] = {**tool, "visible": False}

    # 9. Save document
    from app.schemas.document import DocumentUpdate
    update = DocumentUpdate(components=components, version=doc.version)
    await save_document(db, project_id, user_id, update)

    return {
        "result_body_id": result_body_id,
        "mesh": mesh_data,
    }
```

### 4.6 Нужно изменить `make_boolean()` чтобы возвращать и shape

```python
def make_boolean(self, shape_a, shape_b, operation: str) -> tuple:
    """Returns (mesh_data: dict, brep_bytes: bytes)."""
    from geometry.boolean import make_boolean as _boolean_op

    result_shape, is_empty = _boolean_op(shape_a, shape_b, operation)

    if is_empty:
        raise ValueError("Boolean operation produced empty result.")

    mesh = tessellate_shape(result_shape)
    brep_bytes = self._encode_brep(result_shape)
    return mesh, brep_bytes
```

### 4.7 Схемы в `backend/app/schemas/geometry.py`

```python
class BooleanRequest(BaseModel):
    operation: Literal["union", "subtract", "intersect"]
    target_body_id: str
    tool_body_id: str


class BooleanResponse(BaseModel):
    result_body_id: str
    mesh: MeshResponse
```

### 4.8 Роут в `backend/app/api/routes/geometry.py`

```python
@router.post("/{project_id}/geometry/boolean", response_model=BooleanResponse)
async def boolean_endpoint(
    project_id: str,
    data: BooleanRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    storage: AsyncStorageClient = Depends(get_storage),
):
    """
    Execute boolean (CSG) operation between two bodies.

    1. Validates target and tool bodies exist
    2. Loads B-Rep shapes from MinIO
    3. Performs union/subtract/intersect via OCCT
    4. Saves result mesh + brep to MinIO
    5. Updates document.components
    """
    result = await boolean_operation(
        project_id=project_id,
        operation=data.operation,
        target_body_id=data.target_body_id,
        tool_body_id=data.tool_body_id,
        user_id=current_user.id,
        db=db,
        storage=storage,
    )

    return BooleanResponse(
        result_body_id=result["result_body_id"],
        mesh=MeshResponse(**result["mesh"]),
    )
```

### 4.9 Требуемое изменение extrude для сохранения .brep

В `geometry_service.py`, метод `extrude_sketch()`, после строки:

```python
mesh_data = engine.make_solid_from_extrude(sketch_data, params)
```

Нужно изменить `make_solid_from_extrude` чтобы он возвращал и brep-данные. Либо оставить как есть, добавив отдельный вызов:

```python
# Option: расширить возврат make_solid_from_extrude до (mesh, brep_bytes)
mesh_data, brep_bytes = engine.make_solid_from_extrude(sketch_data, params)

# Cache brep
brep_key = f"{project_id}/geometry/{body_id}.brep"
await storage.put_object(brep_key, brep_bytes, "application/octet-stream")
```

Изменить `OCCEngine.make_solid_from_extrude()` — возвращать `tuple[dict, bytes]`:
```python
def make_solid_from_extrude(self, sketch_data, params) -> tuple:
    # ... after tessellation ...
    brep_bytes = self._encode_brep(shape) if HAS_OCC else None
    return mesh, brep_bytes if brep_bytes else b""
```

> **Важно:** при fallback без OCCT brep_bytes будет пустым. Boolean при этом не сработает — что ожидаемо: без OCCT булевы операции на полигональных мешах через стороннюю библиотеку — это отдельная задача.

### 4.10 OCCEngine — добавление служебных методов

```python
# В OCCEngine:

@staticmethod
def _encode_brep(shape) -> bytes:
    """Encode TopoDS_Shape to BRep binary."""
    from OCC.Core.BRepTools import breptools_Write
    import io
    buf = io.BytesIO()
    # OCCT пишет BRep в поток через C++ stream
    # Используем временный файл
    import tempfile, os
    fd, path = tempfile.mkstemp(suffix=".brep")
    os.close(fd)
    try:
        breptools_Write(shape, path)
        with open(path, "rb") as f:
            return f.read()
    finally:
        os.unlink(path)

@staticmethod
def _decode_brep(data: bytes):
    """Decode BRep binary to TopoDS_Shape."""
    from OCC.Core.BRepTools import breptools_Read
    from OCC.Core.TopoDS import TopoDS_Shape
    from OCC.Core.BRep import BRep_Builder
    import tempfile, os
    fd, path = tempfile.mkstemp(suffix=".brep")
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    try:
        shape = TopoDS_Shape()
        builder = BRep_Builder()
        breptools_Read(shape, path, builder)
        return shape
    finally:
        os.unlink(path)
```

---

## 5. Фронтенд-реализация

### 5.1 Файлы, которые нужно изменить/создать

| Файл | Действие | Описание |
|------|----------|----------|
| `web/src/types/api.ts` | Изменить | Добавить `BooleanRequest`, `BooleanResponse` |
| `web/src/composables/useApi.ts` | Без изменений | Уже поддерживает POST |
| `web/src/components/viewport/ViewportContainer.vue` | Изменить | Поддержка выбора тел (body selection mode) |
| `web/src/components/toolbar/BooleanToolbar.vue` | **Создать** | Панель выбора операции и запуска |
| `web/src/stores/` или composable | **Создать** | `useGeometry.ts` — composable для boolean API |

### 5.2 Типы API (`web/src/types/api.ts`)

Добавить:

```typescript
// Boolean types
export type BooleanOperation = "union" | "subtract" | "intersect";

export interface BooleanRequest {
  operation: BooleanOperation;
  target_body_id: string;
  tool_body_id: string;
}

export interface BooleanResponse {
  result_body_id: string;
  mesh: MeshData;
}
```

### 5.3 Режим выбора тел (ViewportContainer.vue)

Добавить новый режим `"bodySelection"` в дополнение к существующему `"faceSelection"`.

**Текущее поведение:** клик по мешу → выбирает грань → `emit("faceSelected", { bodyId, faceId, ... })`.

**Новое поведение в режиме bodySelection:**
- Клик по мешу → выбирает тело → `emit("bodySelected", { bodyId })`
- Двойной клик по телу или клик по другому телу → выбор второго тела (tool)
- Выбранные тела подсвечиваются цветом (target: синий, tool: оранжевый)

**Изменения в компоненте:**

```typescript
// Новые props
const props = defineProps<{
  selectionMode?: "face" | "body" | "none";
}>();

// Новые emits
const emit = defineEmits<{
  faceSelected: [payload: { bodyId: string; faceId: number; brepTopo: BrepTopo }];
  selectionCleared: [];
  bodySelected: [payload: { bodyId: string }];
  bodyDeselected: [payload: { bodyId: string }];
}>();

// Отслеживаем меши по bodyId
const bodyMeshMap = new Map<string, THREE.Mesh>();

// В addMesh сохраняем bodyId → mesh
function addMesh(meshData: MeshData, bodyId: string = "body-1"): void {
  // ... существующая логика ...
  bodyMeshMap.set(bodyId, mesh);
  faceTriangleMap = meshData.face_triangle_map ?? [];
}
```

### 5.4 Компонент BooleanToolbar.vue

Новый компонент для панели инструментов:

```
┌─────────────────────────────────────┐
│ Boolean Operation                    │
│                                     │
│ Target: [body-1a2b] ← click to pick │
│ Tool:   [body-6f5e] ← click to pick │
│                                     │
│ Operation: [Union ▼]                │
│                                     │
│ [Apply]                             │
└─────────────────────────────────────┘
```

**Состояния:**
1. **Нет выбранных тел** — кнопки "Pick target body" / "Pick tool body"
2. **Выбран target** — подсвечен, показываем "Pick tool body"
3. **Выбраны оба** — показываем dropdown с operation, кнопка Apply активна
4. **Выполнение** — спиннер, кнопки заблокированы
5. **Ошибка** — сообщение об ошибке
6. **Готово** — результат отображён

**Props:**
```typescript
interface BooleanToolbarProps {
  availableBodies: Array<{ id: string; bbox?: { min: number[]; max: number[] } }>;
  selectedTargetId: string | null;
  selectedToolId: string | null;
  loading: boolean;
  error: string | null;
}
```

**Emits:**
```typescript
interface BooleanToolbarEmits {
  selectTarget: [bodyId: string];
  selectTool: [bodyId: string];
  apply: [operation: BooleanOperation];
  clear: [];
}
```

### 5.5 Composable `useGeometry.ts`

Новый composable для геометрических операций:

```typescript
// web/src/composables/useGeometry.ts
import { ref } from "vue";
import { useApi } from "./useApi";
import type { BooleanRequest, BooleanResponse, MeshData } from "@/types/api";

export function useGeometry(projectId: string) {
  const api = useApi();
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function executeBoolean(
    operation: string,
    targetBodyId: string,
    toolBodyId: string,
  ): Promise<{ result_body_id: string; mesh: MeshData } | null> {
    loading.value = true;
    error.value = null;

    try {
      const body: BooleanRequest = {
        operation: operation as any,
        target_body_id: targetBodyId,
        tool_body_id: toolBodyId,
      };
      const result = await api.post<BooleanResponse>(
        `/projects/${projectId}/geometry/boolean`,
        body,
      );
      return { result_body_id: result.result_body_id, mesh: result.mesh };
    } catch (e: any) {
      error.value = e?.error_description || e?.detail || "Boolean operation failed";
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { executeBoolean, loading, error };
}
```

### 5.6 Поток взаимодействия (User Flow)

```
1. Пользователь открывает проект с телами
2. Нажимает кнопку "Boolean" на тулбаре
3. Вьюпорт переходит в режим выбора тел:
   - Все тела (body-*) отображаются с разными цветами
   - Видимые тела (visible !== false) кликабельны
4. Клик по первому телу → оно подсвечивается синим (target)
5. Клик по второму телу → оно подсвечивается оранжевым (tool)
6. Пользователь выбирает операцию из dropdown: Union / Subtract / Intersect
7. Нажимает "Apply"
8. Показывается индикатор загрузки
9. Сервер выполняет операцию, возвращает новый mesh
10. Новое тело отображается во вьюпорте
11. Исходные тела скрываются (visible=false)
12. BooleanToolbar сбрасывается → готов к следующей операции
```

---

## 6. UX: видимость исходных тел

### 6.1 Решение

**По умолчанию: исходные тела скрываются** после успешной boolean-операции.

Причины:
- Соответствует поведению Fusion 360 (исходные тела поглощаются операцией)
- Не загромождает вьюпорт
- Пользователь видит чёткий результат

Альтернативный вариант (можно добавить позже): чекбокс "Keep original bodies" в BooleanToolbar.

### 6.2 Реализация

После успешной операции, в `document.components`, для target и tool тел добавляется поле `"visible": false`.

```python
# В boolean_operation(), шаг 8:
components[target_body_id] = {**target, "visible": False}
components[tool_body_id] = {**tool, "visible": False}
```

### 6.3 Отображение на клиенте

Клиент при загрузке документа проверяет `visible` для каждого тела:
- Если `visible === false` — не добавлять меш в сцену
- В будущем: добавить переключатель видимости в дереве компонентов

В рамках MVP: клиент просто не отображает тела с `visible: false`. Переключатель — отдельная задача.

---

## 7. Обработка ошибок

| Ситуация | HTTP | Код ошибки | Описание |
|----------|------|------------|----------|
| Тело не найдено | 404 | `body_not_found` | Указанный body_id отсутствует в document.components |
| Тело не является body | 404 | `body_not_found` | Компонент существует, но type ≠ "body" (например, sketch) |
| .brep не найден | 400 | `brep_not_found` | Тело создано без OCCT, boolean невозможен |
| Тела не пересекаются (intersect) | 400 | `empty_result` | Intersection returned null shape |
| Subtract всё вырезал | 400 | `empty_result` | Cut result is empty |
| Тела не пересекаются (union) | — | — | Union возвращает исходные тела как отдельные — OK, не ошибка |
| OCCT не установлен | 500 | `occ_not_available` | Попытка boolean на хосте без OCCT (fallback-путь не реализован) |
| Конфликт версий документа | 409 | `version_conflict` | Оптимистичная блокировка |
| Проект не найден | 404 | — | Стандартная ошибка ownership-проверки |

### 7.1 Union с непересекающимися телами

`BRepAlgoAPI_Fuse` для непересекающихся тел возвращает compound (составную форму), а не единый solid. Для MVP это допустимо — OCCT всё равно вернёт валидную форму. В будущем можно добавить проверку и warning.

### 7.2 Частичное перекрытие (Subtract с частичным пересечением)

`BRepAlgoAPI_Cut` корректно обрабатывает частичное перекрытие — вычитает пересекающуюся часть. Проблем нет.

---

## 8. Тестирование

### 8.1 Юнит-тесты (`backend/tests/test_boolean.py`)

```python
class TestBooleanOperations:
    """Test boolean operations (require OCCT / Docker)."""

    async def test_union_two_boxes(self):
        """Union of two overlapping boxes → single solid."""

    async def test_subtract_box_from_box(self):
        """Subtract one box from another → hollow result."""

    async def test_intersect_two_boxes(self):
        """Intersection of two overlapping boxes."""

    async def test_union_non_overlapping(self):
        """Union of non-overlapping bodies → compound (not error)."""

    async def test_subtract_non_overlapping(self):
        """Subtract non-overlapping body → original body unchanged."""

    async def test_intersect_non_overlapping(self):
        """Intersect non-overlapping bodies → empty result error."""

    async def test_invalid_body_id(self):
        """404 when body not found."""

    async def test_missing_brep(self):
        """400 when .brep not in MinIO."""

class TestBooleanAPI:
    """Integration tests for POST /api/projects/{id}/geometry/boolean."""

    async def test_successful_union(self): ...
    async def test_successful_subtract(self): ...
    async def test_successful_intersect(self): ...
    async def test_empty_result_returns_400(self): ...
    async def test_invalid_operation_returns_422(self): ...
```

### 8.2 Тест-кейсы для мануального тестирования

1. Два пересекающихся параллелепипеда → Union (должен получиться L-образный или T-образный solid)
2. Один параллелепипед через другой → Subtract (дырка)
3. Пересечение двух параллелепипедов → Intersect (общая часть)
4. Два полностью разделённых тела → Intersect (ошибка empty_result)
5. Тело, скрытое (visible=false) — не должно быть доступно для выбора

---

## 9. План реализации (последовательность)

### Фаза 1: Бэкенд (ядро)
1. Создать `backend/geometry/boolean.py` с `make_boolean_occ()`
2. Добавить методы `_encode_brep()` / `_decode_brep()` в `OCCEngine`
3. Добавить `make_boolean()` в `OCCEngine`
4. Изменить `make_solid_from_extrude()` — возвращать `(mesh, brep_bytes)`
5. Изменить `extrude_sketch()` в `geometry_service.py` — сохранять `.brep` в MinIO
6. Обновить `extrude` роут — передавать brep_bytes в сервис

### Фаза 2: Бэкенд (API)
7. Добавить `BooleanRequest` / `BooleanResponse` в `schemas/geometry.py`
8. Добавить `boolean_operation()` в `geometry_service.py`
9. Добавить `POST /{project_id}/geometry/boolean` в роуты
10. Обработка ошибок (body_not_found, brep_not_found, empty_result)

### Фаза 3: Фронтенд
11. Добавить типы `BooleanRequest` / `BooleanResponse` в `types/api.ts`
12. Создать `useGeometry.ts` composable
13. Изменить `ViewportContainer.vue` — добавить режим body selection
14. Создать `BooleanToolbar.vue`
15. Интегрировать в интерфейс проекта

### Фаза 4: Тестирование
16. Написать `test_boolean.py`
17. Мануальное тестирование в Docker-контейнере с OCCT

---

## 10. Acceptance Criteria

- [ ] `POST /api/projects/{id}/geometry/boolean` принимает `{operation, target_body_id, tool_body_id}` и возвращает новый `result_body_id` + mesh
- [ ] Union двух пересекающихся тел успешно создаёт объединённый solid
- [ ] Subtract вычитает tool из target
- [ ] Intersect возвращает общую часть
- [ ] Непересекающиеся тела при intersect возвращают `error: "empty_result"` (400)
- [ ] Результат сохраняется в `document.components` с `source.kind = "boolean"`
- [ ] Исходные тела получают `visible: false`
- [ ] `.brep`-файлы сохраняются в MinIO при extrude
- [ ] `.brep`-файлы загружаются из MinIO при boolean
- [ ] Клиент может выбрать два тела во вьюпорте, выбрать операцию, применить
- [ ] Результат отображается во вьюпорте без перезагрузки страницы
- [ ] При отсутствии OCCT (fallback) возвращается понятная ошибка
- [ ] Нельзя выбрать скрытое тело (visible=false) для boolean

---

## 11. Риски и открытые вопросы

| Риск | Вероятность | Влияние | Митигация |
|------|------------|---------|-----------|
| OCCT Fuse/Cut/Common падает на сложной геометрии | Средняя | Высокое | Начать с простых тестовых кейсов, добавить try/except с понятными ошибками |
| BRep-сериализация через временные файлы медленная | Средняя | Среднее | Рассмотреть in-memory методы breptools (если доступны); для MVP — ок |
| Изменение формата `document.components` ломает существующие документы | Низкая | Среднее | MVP-проект, документов мало; обратная совместимость для старых документов — второстепенно |
| Union непересекающихся тел даёт compound | Высокая | Низкая | Приемлемо для MVP; compound тесселируется нормально |
| Фронтенд не отображает несколько тел одновременно | Высокая | Среднее | Нужно изменить ViewportContainer для поддержки множественных мешей (сейчас только один активный меш через `addMesh`) |

### 11.1 Критическое замечание по ViewportContainer

Текущая реализация `ViewportContainer.vue` поддерживает **только один активный меш** — `activeMesh` указывает на последний добавленный. Для выбора тел нужно:

- Хранить массив мешей (уже есть `meshObjects[]`)
- Каждый меш должен быть кликабельным
- `onCanvasClick` должен перебирать все меши (не только `activeMesh`)
- Подсветка должна работать независимо на каждом меше

Это требует рефакторинга `ViewportContainer.vue`, что является частью данного инкремента.

### 11.2 Альтернативный подход: boolean на мешах без OCCT

Для fallback-пути можно рассмотреть библиотеку [manifold-3d](https://github.com/elalish/manifold) (Python-биндинги) или [PyMeshLab](https://github.com/cnr-isti-vclab/PyMeshLab). Однако:
- Качество результата на мешах хуже, чем на B-Rep
- Дополнительная зависимость
- **Решение на MVP:** требовать наличие OCCT (работает только в Docker). Fallback не реализуем, возвращаем ошибку.

---

> **Спецификация завершена. Готова к передаче кодеру.**
