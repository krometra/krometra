# Крометра — Product Design Document

> **Статус:** Черновик v0.4  
> **Дата:** 2026-09-26  
> **Изменения v0.4:** геометрия целиком в браузере: OpenCASCADE, собранный в WebAssembly (`replicad-opencascadejs`), работает в Web Worker; серверное ядро pythonOCC удалено (сентябрь 2026). Backend — авторизация, проекты, документ и файловое хранилище (STEP, меш, превью). Разделы 4.1, 4.3, 5, 6.8, 9–11 и 14 обновлены под эту архитектуру; актуальный порядок работ — в `.docs/ROADMAP.md`.  
> **Изменения v0.3:** переезд фронтенда на Vue 3 + createSharedComposable (VueUse) + zag.js; авторизация переведена на OAuth2/OIDC-ready архитектуру (PKCE, httpOnly refresh token ротация, подготовка к Yandex ID); своя дизайн-система вместо Tailwind/Radix
> **Изменения v0.2:** добавлена модель пользователей, проектов, аутентификация, серверное хранение, подготовка к коллаборации

---

## 1. Обзор и видение

### 1.1 Что такое Крометра

**Крометра** — браузерная инженерная CAD-система для параметрического 3D-моделирования. Никаких установок, никаких зависимостей от GPU на клиенте сверх современного браузера.

### 1.2 Почему браузерный CAD

- **Zero install.** Открыл вкладку — работаешь. Это главное преимущество Onshape.
- **Кроссплатформенность.** Windows, macOS, Linux, ChromeOS — везде одинаково.
- **Совместная работа.** Мультипользовательское редактирование из коробки (как Google Docs, но для CAD) — архитектура закладывается с MVP, функциональность в v1/v2.
- **Никаких лицензионных ключей.** SaaS-подписка, всегда актуальная версия.

### 1.3 Конкуренты и референсы

| Продукт | Модель | Ядро | Платформа |
|---------|--------|------|-----------|
| **Fusion 360** | Desktop + облако | ShapeManager (ACIS-based) | Windows, macOS, web (view-only) |
| **Onshape** (PTC) | Pure SaaS | Parasolid (на сервере) | Браузер + iOS/Android |
| **SolidWorks** | Desktop | Parasolid | Windows |
| **FreeCAD** | Desktop open-source | OpenCASCADE | Windows, macOS, Linux |

**Крометра — браузерный CAD, похожий на Onshape (ничего не устанавливать, проекты в облаке), но точное B-rep ядро OpenCASCADE работает прямо в браузере (WASM в Web Worker), а исходный код доступен под лицензией FSL-1.1-ALv2 (source-available: через два года каждая версия переходит в Apache 2.0).**

---

## 2. Ключевые концепции CAD (Fusion 360 — референс)

### 2.1 Парадигмы моделирования

#### Параметрическое моделирование (Parametric / History-based)
- Каждое действие записывается в историю (timeline)
- Модель — это дерево фич (features): Sketch → Extrude → Fillet → Hole → ...
- Изменение параметра на раннем шаге перестраивает всю модель
- **Это основная парадигма инженерного CAD**

#### Прямое моделирование (Direct Modeling)
- Push/pull граней без истории
- Удобно для концептуального дизайна и работы с импортированной геометрией
- **MVP: не включаем, но архитектура должна позволять добавить позже**

#### Поверхностное моделирование (Surface Modeling)
- Работа с NURBS-поверхностями, а не твёрдыми телами
- Для сложных органических форм
- **MVP: не включаем**

### 2.2 Ключевые фичи Fusion 360 (что берём в MVP)

| Фича | Fusion 360 | Крометра MVP | Приоритет |
|------|-----------|----------------|-----------|
| **Sketch** (2D-эскиз) | ✅ | ✅ | P0 |
| **Extrude** (выдавливание) | ✅ | ✅ | P0 |
| **Revolve** (вращение) | ✅ | ✅ | P1 |
| **Fillet / Chamfer** | ✅ | ✅ | P1 |
| **Boolean operations** | ✅ | ✅ | P0 |
| **Timeline** (история) | ✅ | ✅ | P0 |
| **Parameters / Constraints** | ✅ | ✅ (базовые) | P0 |
| **Assemblies** (сборки) | ✅ | ❌ (MVP) | v1 |
| **CAM** | ✅ | ❌ | v2+ |
| **Simulation (FEA)** | ✅ | ❌ | v2+ |
| **Render** | ✅ | ❌ | v2+ |
| **Sheet metal** | ✅ | ❌ | v2+ |
| **PCB** | ✅ | ❌ | — |
| **Multi-user accounts** | ✅ (облако) | ✅ | P0 |
| **Collaboration** (sharing/co-editing) | ✅ (облако) | ❌ (архитектура заложена) | v1 |
| **Import STEP/IGES** | ✅ | ✅ (STEP) | P1 |
| **Export STEP/STL** | ✅ | ✅ | P1 |

---

## 3. MVP Scope

### 3.1 Что входит в MVP

**Аутентификация и пользователи:**
- Регистрация (email + пароль, мин. 8 символов, bcrypt cost 12)
- OAuth2 password flow: client → POST /api/auth/token с grant_type=password
- Access token: JWT, 15 мин, передаётся в Authorization: Bearer header
- Refresh token: opaque, 30 дней, httpOnly Secure SameSite cookie, НЕ localStorage
- Refresh token rotation: при каждом обновлении старый инвалидируется, новый выдаётся
- Family tracking: цепочка refresh-токенов отслеживается в Redis; при компрометации одного — вся цепочка инвалидируется
- Logout from all devices: инвалидация всей refresh token family пользователя
- Rate limiting в Redis: неудачные попытки входа по IP и по email, регистрации и refresh по IP → 429 + Retry-After
- Архитектурная готовность к Yandex ID: модель БД поддерживает OAuth-аккаунты (multiple identity providers), API готов к authorization_code flow
- Только одна роль — обычный пользователь (админка не нужна в MVP)

**Управление проектами:**
- Каждый пользователь видит только свои проекты (изоляция)
- Создание, переименование, удаление проекта
- Список проектов пользователя (dashboard)
- Геометрию строит браузерное ядро, но документ и файлы тел (STEP, меш) хранятся на сервере — проект открывается с любого устройства
- Автосохранение: по таймеру (каждые 30 секунд при наличии изменений) + по завершению геометрической операции

**3D Viewport:**
- Орбита, панорамирование, зум (стандартные CAD-камеры)
- Отображение B-rep геометрии (wireframe, shaded, shaded+edges)
- Selection (граней, рёбер, вершин)
- Grid / origin plane
- View cube (навигация по видам: front, top, right, isometric)

**2D Sketcher:**
- Выбор плоскости для эскиза (XY, XZ, YZ или грань тела)
- Примитивы: линия, прямоугольник, окружность, дуга
- Базовые геометрические ограничения: horizontal, vertical, coincident, parallel, perpendicular
- Базовые размерные ограничения: distance, radius/diameter, angle
- Простой constraint solver (2D)

**3D Features:**
- Extrude (выдавливание эскиза): distance, through-all, symmetric, cut
- Fillet (скругление рёбер): constant radius
- Chamfer (фаска): distance-distance

**Boolean Operations (CSG):**
- Union (объединение тел)
- Subtract (вычитание тел)
- Intersect (пересечение тел)

**Timeline:**
- История всех операций
- Возможность редактировать параметры ранних операций
- Перестроение модели (regeneration)
- Undo/Redo

**Document Structure:**
- Компоненты (components) — дерево деталей
- Bodies (тела) внутри компонентов
- Sketches, features как дочерние элементы

**File Operations:**
- Сохранение проекта (собственный формат)
- Экспорт: STEP, STL
- Импорт: STEP

**UI:**
- Тулбар с инструментами
- Дерево компонентов (browser tree)
- Панель свойств / параметров
- Timeline внизу экрана
- Строка состояния

### 3.2 Что НЕ входит в MVP

- Assemblies (сборки)
- Direct modeling (прямое редактирование)
- Поверхностное моделирование (surfacing)
- CAM, Simulation, Rendering
- PCB design
- Sheet metal
- Коллаборация (sharing проектов, совместное редактирование) — архитектура закладывается, но не реализуется
- Мобильные приложения
- Офлайн-режим
- OAuth/Google/GitHub/Yandex ID логин — архитектура заложена, но в MVP реализован только password provider (password grant в OAuth2). Yandex ID как OIDC-провайдер — в v1
- Админ-панель, управление пользователями
- Generative design
- T-spline / subdivision modeling

### 3.3 Реалистичность MVP

MVP охватывает ~15-20% функциональности Fusion 360, но это **20% которые дают 80% ценности**. Базовое параметрическое моделирование — это ядро инженерного CAD.

Многопользовательская архитектура закладывается с первого дня:
- Каждый пользователь имеет свой аккаунт
- Проекты изолированы по пользователям
- Модель данных предусматривает будущий sharing (ProjectMember)
- Но в MVP — строго один владелец на проект, без приглашений

**Оценка для команды из 3-5 человек:**
- MVP: 12-18 месяцев (с учётом сложности геометрического ядра)
- v1 (сборки, улучшенный sketcher, коллаборация): +6-9 месяцев
- v2 (CAM/Sim базовое): +12 месяцев

---

## 4. Архитектура

### 4.1 Общая схема

```
┌──────────────────────────────────────────────────────────────────┐
│                       CLIENT (Browser)                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐          │
│  │ Vue 3 UI     │ │ 3D Viewport  │ │ State            │          │
│  │ (zag.js,     │ │ (Three.js)   │ │ (shared          │          │
│  │  CSS Modules)│ │              │ │  composables)    │          │
│  └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘          │
│         │     тесселяция │                  │                    │
│  ┌──────┴────────────────┴──────────────────┴──────────┐         │
│  │ Web Worker: OpenCASCADE/WASM (replicad)              │         │
│  │ B-rep тел, операции, persistent naming, STEP/STL     │         │
│  └────────────────────────┬────────────────────────────┘         │
│  ┌────────────────────────┴────────────────────────────┐         │
│  │ API client (HTTP REST) + OAuth2 (auto refresh)       │         │
│  └────────────────────────┬────────────────────────────┘         │
└───────────────────────────┼──────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────┼──────────────────────────────────────┐
│                    SERVER (FastAPI)                               │
│  Auth (OAuth2)        · Projects · Documents · browser-* uploads │
│  Геометрию не строит и не разбирает: проверяет владельца,        │
│  версию документа и контракт меша, хранит STEP как opaque-файл   │
│     │                     │                          │            │
│  ┌──┴───────┐   ┌─────────┴─────────┐   ┌────────────┴────────┐  │
│  │  Redis   │   │    PostgreSQL     │   │      MinIO/S3       │  │
│  │ refresh  │   │ users, projects,  │   │ STEP, меш, таблица  │  │
│  │ families,│   │ documents         │   │ имён тел, превью    │  │
│  │ лимиты   │   │ (timeline, JSONB) │   │                     │  │
│  └──────────┘   └───────────────────┘   └─────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Фронтенд

#### Стек
| Слой | Технология | Обоснование |
|------|-----------|-------------|
| **Framework** | Vue 3 + Composition API + TypeScript | Реактивность из коробки (ref/reactive), отличная TypeScript-поддержка, легче React для команды без React-экспертизы, SFC как нативный формат компонентов |
| **3D Rendering** | Three.js (r185+) | Зрелая, WebGL/WebGPU, огромное сообщество. Используется напрямую через ref, без абстракций |
| **State Management** | createSharedComposable (VueUse) | Глобальное реактивное состояние без отдельной библиотеки сторов — каждый модуль состояния это обычный composable, расшаренный через createSharedComposable. Никаких отдельных сторов, меньше зависимостей, идиоматично для Composition API |
| **UI Components** | zag.js + CSS Modules | Headless state machines для UI-логики (dialog, menu, tooltip, select, combobox, tree-view, etc.) + собственные стили через CSS-переменные. Никакого Tailwind, никакого Radix |
| **Styling** | CSS Modules + Vanilla Extract (для тем) | Сквозная дизайн-система на CSS-переменных (--kr-color-*, --kr-spacing-*, --kr-radius-*). CSS Modules для изоляции стилей компонентов. Vanilla Extract для type-safe тем |
| **Routing** | Vue Router 4 | Стандартный роутер для Vue 3, guards для auth |
| **Canvas/Sketcher** | HTML5 Canvas API + самописный solver | Никакая библиотека не решает CAD-скетчер из коробки |
| **Web Workers** | Comlink | Параллельные вычисления (tessellation, raytracing для selection) |
| **File handling** | IndexedDB (Dexie.js) | Локальный кеш, офлайн-буфер |

#### Почему Vue 3, а не React

| Критерий | Vue 3 (выбрано) | React 19 |
|----------|----------------|----------|
| **Реактивность** | Автоматическая (ref/reactive) | Ручная (useState, useMemo, useCallback) |
| **Компоненты** | Single File Components (template + script + style) | JSX + separate CSS |
| **State management** | createSharedComposable — легковеснее, без зависимостей | Zustand/Redux — внешние библиотеки |
| **TypeScript** | Отличная поддержка в Composition API | Отличная |
| **Обучение** | Проще для команды без React-экспертизы | Крутая кривая для новичков |
| **Виртуальный DOM** | Компиляторно-оптимизированный | Fiber reconciler |
| **Размер бандла** | ~33 KB gzip (core + runtime) | ~45 KB gzip |
| **Three.js интеграция** | Через template ref — прямой контроль | Через useRef — тоже прямой, но больше бойлерплейта |

**Почему createSharedComposable вместо Pinia:**
- Pinia добавляет отдельную концепцию «стора» (defineStore, actions, getters) — дополнительная абстракция над Composition API
- createSharedComposable — это обычный composable, обёрнутый в синглтон: тот же ref/reactive/computed/watch, тот же TypeScript, никаких новых концепций
- Меньше зависимостей: VueUse уже используется в проекте для других утилит (useEventListener, useResizeObserver, etc.)
- Меньше бандл: не тянет отдельную библиотеку сторов
- Идиоматично для Vue 3 Composition API: разработчик пишет обычный composable, createSharedComposable делает его глобальным
- Если в будущем понадобится Pinia (devtools, плагины) — миграция тривиальна: shared composable → Pinia store механически

**Пример shared composable (useDocument):**

```typescript
// composables/useDocument.ts
import { ref, computed } from 'vue'
import { createSharedComposable } from '@vueuse/core'

export const useDocument = createSharedComposable(() => {
  const document = ref<Document | null>(null)
  const isDirty = ref(false)
  const isLoading = computed(() => document.value === null)

  async function loadDocument(projectId: string) { /* ... */ }
  async function saveDocument() { /* ... */ }

  return { document, isDirty, isLoading, loadDocument, saveDocument }
})
```

Те же ref/computed, что и в компонентах. Никаких defineStore, actions, getters — просто функция.

#### Почему zag.js, а не Radix UI / Tailwind

| Критерий | zag.js (выбрано) | Radix UI | Tailwind CSS |
|----------|-----------------|----------|-------------|
| **Парадигма** | State machines (headless) | Headless компоненты | Utility-first CSS |
| **Framework** | React, Vue, Solid, Svelte | Только React | Любой |
| **Логика** | Конечные автоматы, предсказуемая | Императивная в useEffect | — (чистый CSS) |
| **Доступность** | Встроенная (WAI-ARIA из коробки) | Встроенная | Ручная |
| **Стилизация** | Полный контроль (headless) | Полный контроль (headless) | Utility-классы (ограниченный контроль) |
| **Vue-поддержка** | ✅ Официальный адаптер @zag-js/vue | ❌ Только React | ✅ Но через классы |
| **Дизайн-система** | Своя (любая стилизация) | Своя | Выглядит как Tailwind |
| **Риск vendor lock** | Минимальный (машины — чистый JS) | Только React-экосистема | HTML-классы (замена возможна) |

**zag.js даёт:** state machine-подход к UI-логике. Каждый интерактивный компонент (dialog, menu, tooltip, select, combobox, tree-view, tabs, splitter) — это конечный автомат. Логика отделена от рендеринга. Это означает:
- Логика компонента тестируется изолированно
- Поведение предсказуемо (нет гонок useEffect)
- Одна и та же машина работает в React, Vue, Solid, Svelte
- Полный контроль над стилями — можно построить любой дизайн

**Подход к дизайн-системе:**
- CSS-переменные на `:root` задают токены дизайна: цвета, шрифты, радиусы, тени, отступы
- Каждый zag-компонент оборачивается в собственный Vue SFC с CSS Modules
- CSS Modules дают изоляцию имён классов без конфликтов
- Vanilla Extract используется для тем (светлая/тёмная) — даёт type-safe CSS в TypeScript

**Пример компонента (диалог на zag.js):**

```vue
<!-- KrDialog.vue -->
<script setup lang="ts">
import * as dialog from '@zag-js/dialog'
import { useMachine, normalizeProps } from '@zag-js/vue'
import { computed } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const [state, send] = useMachine(dialog.machine, {
  open: computed(() => props.open),
  onOpenChange: (details) => emit('update:open', details.open),
})

const api = computed(() => dialog.connect(state.value, send, normalizeProps))
</script>

<template>
  <div v-if="api" v-bind="api.getRootProps()" :class="$style.dialog">
    <div v-bind="api.getBackdropProps()" :class="$style.backdrop" />
    <div v-bind="api.getContentProps()" :class="$style.content">
      <h2 v-bind="api.getTitleProps()" :class="$style.title">
        <slot name="title" />
      </h2>
      <div :class="$style.body">
        <slot />
      </div>
      <button v-bind="api.getCloseTriggerProps()" :class="$style.close">
        Закрыть
      </button>
    </div>
  </div>
</template>

<style module>
.dialog { /* ... */ }
.backdrop { background: var(--kr-overlay); }
.content { background: var(--kr-surface); border-radius: var(--kr-radius-lg); }
.title { font: var(--kr-font-heading); }
.body { padding: var(--kr-spacing-md); }
.close { /* ... */ }
</style>
```

**Используемые zag.js компоненты (MVP):**
| Компонент | Пакет | Где используется |
|-----------|-------|-----------------|
| Dialog | `@zag-js/dialog` | Модальные окна, настройки, about |
| Menu | `@zag-js/menu` | Контекстные меню, выпадающие меню тулбара |
| Tooltip | `@zag-js/tooltip` | Подсказки на кнопках инструментов |
| Select | `@zag-js/select` | Выпадающие списки (плоскость, тип операции) |
| Combobox | `@zag-js/combobox` | Автодополнение в поиске/параметрах |
| Tree View | `@zag-js/tree-view` | Browser Tree (дерево компонентов) |
| Tabs | `@zag-js/tabs` | Панели свойств с вкладками |
| Splitter | `@zag-js/splitter` | Разделители панелей (browser ↔ viewport) |
| Number Input | `@zag-js/number-input` | Числовые поля (расстояния, углы) |
| Toast | `@zag-js/toast` | Уведомления (сохранено, ошибка) |
| Collapsible | `@zag-js/collapsible` | Сворачиваемые секции в панели свойств |

#### Альтернативы для 3D, которые отклонили
- **Babylon.js** — силён в геймдеве, но меньше CAD-ориентированных фич
- **Raw WebGPU** — слишком низкоуровнево, много boilerplate
- **TresJS (Vue wrapper для Three.js)** — добавляет абстракцию, но для CAD нужен тонкий контроль над render loop. Используем чистый Three.js через template ref

#### Структура фронтенд-приложения

Актуальная структура `web/src/` — в `CLAUDE.md` (раздел «Структура репозитория»). Ключевые узлы: `views/` (страницы), `components/` (`ui/` — дизайн-система, `viewport/`, `editor/`, `sketcher/`), `composables/` (по доменам: `shared/`, `editor/`, `viewport/`, `sketcher/`), `workers/browser-geometry.worker.ts` и `workers/geometry/` (операции ядра), `lib/` (чистая логика под vitest), `core/commands/` (undo/redo).

### 4.3 Бэкенд

#### Стек
| Слой | Технология | Обоснование |
|------|-----------|-------------|
| **API Server** | Python 3.12 + FastAPI | Асинхронность, Pydantic валидация, авто-документация |
| **Database** | PostgreSQL 16 | Пользователи, проекты, документ (timeline в JSONB) |
| **Cache** | Redis | Refresh token family tracking, rate limiting |
| **File Storage** | MinIO (S3-compatible) | STEP и меши тел, таблицы имён, превью проектов |
| **Auth** | OAuth2 + OpenID Connect (встроенный FastAPI OAuth2) + bcrypt | Access: 15 мин JWT, Refresh: 30 дней opaque в httpOnly Secure SameSite cookie, ротация с family tracking, архитектурная готовность к Yandex ID как OIDC-провайдеру |

#### Почему геометрия в браузере, а не на сервере

- Изначально ядро (pythonOCC) работало на сервере. В сентябре 2026 геометрия целиком переехала в браузер: OCCT, собранный в WebAssembly (`replicad-opencascadejs`), работает в Web Worker, серверное ядро удалено.
- Интерактивные операции не ждут сетевого запроса и серверной очереди; сервер не тратит CPU на геометрию и масштабируется как обычное веб-приложение.
- Цена — WASM ~23 МБ (~7 МБ в gzip), кэшируется навсегда по хешу в имени, и зависимость от памяти устройства (лимиты модели и перезапуск ядра — `lib/browserKernel.ts`).
- Точность не теряется: это то же B-rep ядро, во вьюпорт уходит тесселяция, а в хранилище — STEP.

#### Авторизация: почему OAuth2 с первого дня

**Почему не простой JWT с логином/паролем:**
- Refresh token в localStorage крадётся через XSS — httpOnly cookie решает эту проблему
- Без ротации refresh токенов скомпрометированный токен даёт вечный доступ
- Без family tracking нельзя отозвать все сессии разом

**Что даёт OAuth2-ready архитектура:**
- Password grant работает в MVP (email+пароль, как и раньше), но через стандартный OAuth2 endpoint `/api/auth/token`
- PKCE для password flow бессмысленен (нет authorization code, который можно перехватить) и не используется; он появится вместе с `authorization_code` flow для Yandex ID
- Когда Yandex ID добавляется в v1 — это просто ещё один provider в том же `/api/auth/authorize` + `/api/auth/token`
- OpenID Connect даёт стандартизированный UserInfo endpoint + id_token для будущих провайдеров

**Архитектурная готовность к Yandex ID:**
- Yandex ID реализует стандартный OAuth 2.0 / OpenID Connect
- Поток: пользователь → редирект на Yandex OAuth → authorization code → наш `/api/auth/token` обменивает code на наши токены
- В модели БД: таблица `oauth_accounts` связывает внутреннего User с внешним провайдером (provider, provider_user_id)
- В MVP таблица `oauth_accounts` создаётся, но не заполняется — ждёт Yandex ID в v1

**Безопасность токенов (полная схема):**

| Элемент | Хранение | Время жизни | Ротация |
|---------|----------|-------------|---------|
| Access Token (JWT) | Память (переменная JS) | 15 минут | Автоматически через refresh |
| Refresh Token (opaque) | httpOnly Secure SameSite cookie | 30 дней | Полная ротация + family tracking |

**Refresh token family tracking (Redis):**
```
family:{familyId} → {
  tokens: [
    { jti: "rt-001", status: "replaced" },
    { jti: "rt-002", status: "active" }
  ],
  userId: "uuid",
  deviceFingerprint: "hash(IP+UA)"
}
```
- При refresh: старый токен → `status: "replaced"`, новый → `status: "active"`
- При logout: вся family → удаляется
- При обнаружении уже `replaced` токена (replay attack) → вся family инвалидируется, пользователь перелогинивается

**Device fingerprinting (basic):**
- В refresh token записывается хэш от `SHA-256(IP + User-Agent)`
- При каждом refresh проверяется соответствие
- При смене IP/UA — допустимо (мобильные сети, обновления браузера), но логируется
- Это не жёсткая привязка, а сигнал для security-мониторинга

#### Структура бэкенда

```
backend/
├── app/
│   ├── main.py, config.py
│   ├── api/
│   │   ├── routes/          # auth, projects (+ превью), documents, sketches,
│   │   │                    # geometry / browser_geometry / browser_thread (browser-* загрузки)
│   │   └── deps.py          # get_db, get_current_user
│   ├── core/                # database, security (OAuth2/JWT/bcrypt), rate_limit, storage (MinIO)
│   ├── models/              # user, project, document, refresh_token, oauth_account
│   ├── schemas/             # Pydantic
│   └── services/            # auth, project, document, thumbnail;
│                            # geometry_ops/ — приём результатов браузерного ядра
├── alembic/                 # миграции
└── tests/                   # pytest
```

---

## 5. Геометрическое ядро (детально)

### 5.1 Почему OpenCASCADE

| Критерий | OpenCASCADE | Альтернативы |
|----------|------------|-------------|
| **Лицензия** | LGPL 2.1 (можно в SaaS) | Parasolid / ACIS — proprietary |
| **B-rep** | Полноценный | — |
| **STEP/IGES** | Встроенный импорт/экспорт | — |
| **Булевы операции** | Да (BOP Algo) | — |
| **Fillet/Chamfer** | Да | — |
| **Mesh tessellation** | Да (BRepMesh) | — |
| **Зрелость** | 25+ лет, основа FreeCAD | — |
| **WASM-порт** | `replicad-opencascadejs` — используется в Крометре | — |

**Главный недостаток OCCT:** сложное C++ API, не всегда стабильно на сложной геометрии (особенно fillet). Но для MVP это достаточный компромисс. В Крометре OCCT работает в браузере через `replicad`: операции — `web/src/workers/geometry/`, чистая логика — `web/src/lib/browser*.ts`.

### 5.2 Представление геометрии в системе

#### Браузер (Web Worker с OCCT/WASM):
- **B-rep тел** — держит между командами, строит, пересобирает и освобождает
- **Stable names** граней и рёбер (`f-…`, `e-…`), переносимые историей `Modified()/Generated()`
- **Тесселяция** для вьюпорта и экспорт STEP/STL

#### Сервер хранит:
- **Документ** (feature tree / timeline, эскизы) в PostgreSQL
- **Файлы тел** в MinIO: STEP как opaque-объект, меш с именами граней/рёбер, таблица имён, превью проекта

#### Поток данных при Extrude:
```
1. Клиент: пользователь рисует sketch → 2D constraint solver → набор кривых
2. Worker (OCCT/WASM): wire из кривых → face → extrude → solid (B-rep) + имена
3. Worker: тесселяция → меш во вьюпорт, STEP для хранения
4. Клиент → Сервер: POST /api/projects/{id}/geometry/browser-extrude (параметры, меш, STEP, версия документа)
5. Сервер: проверяет владельца, версию и контракт меша, сохраняет файлы и запись timeline
6. При открытии проекта: меш рисуется сразу, STEP гидрируется в Worker для следующих операций
```

### 5.3 2D Constraint Solver (скетчер)

Отдельная сложная подсистема. Для MVP:

- **Подход:** итеративный relaxation solver (как в SolveSpace)
- **Ограничения MVP:** horizontal, vertical, coincident (point-on-point, point-on-line), parallel, perpendicular, equal, distance, radius, angle
- **Альтернативы для MVP:**
  - PlaneGCS (из FreeCAD) — мощный, но на C++, нужно оборачивать
  - SolveSpace solver — можно скомпилировать в WASM
  - **Рекомендация для MVP:** упрощённый relaxation solver на TypeScript, работающий в Web Worker. Ограничение: до ~50 entities. Этого достаточно для MVP-скетчей.

---

## 6. Модель данных

### 6.1 Пользователь (User)

```typescript
interface User {
  id: string;                  // UUID v4
  email: string;               // Уникальный, используется для логина
  passwordHash: string | null; // bcrypt, null для OAuth-only пользователей
  displayName: string;         // Отображаемое имя (по умолчанию = email)
  avatarUrl?: string;          // Аватар (локальный или с OAuth-провайдера)
  createdAt: DateTime;
  updatedAt: DateTime;
  // Связанные OAuth-аккаунты (см. §6.2)
  oauthAccounts: OAuthAccount[];
}
```

**Правила:**
- Регистрация: email + пароль (мин. 8 символов)
- Email уникален в системе
- Пароль хешируется bcrypt (cost factor 12)
- `passwordHash` может быть `null` — для пользователей, вошедших только через OAuth
- Аутентификация — через OAuth2 password flow (email + пароль)
- Access token: JWT (15 мин), передаётся в `Authorization: Bearer` header
- Refresh token: opaque (30 дней), хранится в httpOnly Secure SameSite cookie
- Refresh token rotation: старый инвалидируется при каждом обновлении
- Refresh token family tracking в Redis: все токены одной цепочки отслеживаются
- При logout: вся refresh token family инвалидируется (logout from all devices)
- Device fingerprint: хэш IP + User-Agent сохраняется в refresh token family

### 6.2 OAuth-аккаунты (готовность к Yandex ID)

```typescript
interface OAuthAccount {
  id: string;                  // UUID v4
  userId: string;              // FK → User.id
  provider: string;            // "yandex", "google", "github"
  providerUserId: string;      // ID пользователя у провайдера
  providerEmail?: string;      // Email от провайдера (может отличаться от основного)
  accessToken?: string;        // Токен провайдера (зашифрован в БД)
  refreshToken?: string;       // Refresh токен провайдера (зашифрован)
  tokenExpiresAt?: DateTime;   // Когда истекает токен провайдера
  linkedAt: DateTime;
}
```

**Правила:**
- Один User может иметь несколько OAuth-аккаунтов (Yandex + Google)
- Пара `(provider, providerUserId)` уникальна в системе
- При первом входе через OAuth: создаётся User (passwordHash = null) + OAuthAccount
- При привязке OAuth к существующему аккаунту: User уже существует, добавляется OAuthAccount
- В MVP таблица `oauth_accounts` создаётся миграцией, но API OAuth-провайдеров не включён
- Для Yandex ID в v1: достаточно реализовать authorization_code flow и обменять code в нашем `/api/auth/token`

### 6.3 Проект (Project)

```typescript
interface Project {
  id: string;                  // UUID v4
  ownerId: string;            // FK → User.id
  name: string;               // Название проекта
  description?: string;       // Описание (опционально)
  thumbnail?: string;         // PNG-снимок вьюпорта, загружает клиент
  document: Document;         // CAD-данные (MVP: один проект = один документ)
  createdAt: DateTime;
  updatedAt: DateTime;        // Автообновляется при любом изменении
}
```

**Правила:**
- Пользователь видит только свои проекты (ownerId = current_user.id)
- Документ и файлы тел хранятся на сервере
- При удалении проекта удаляются все связанные данные (document + файлы тел)
- Для v2: проект может быть расшарен другим пользователям (см. §6.5)

### 6.4 Документ и CAD-данные

```typescript
interface Document {
  id: string;
  name: string;
  components: Component[];
  timeline: TimelineEntry[];
  metadata: {
    createdAt: DateTime;
    updatedAt: DateTime;
    version: number;
  };
}

interface Component {
  id: string;
  name: string;
  origin: Origin; // 3D позиция и ориентация
  bodies: Body[];
  sketches: Sketch[];
  features: Feature[];
  children: Component[]; // sub-components (assemblies в будущем)
}

interface Body {
  id: string;
  name: string;
  brepId: string; // ссылка на файлы тела (STEP, меш) в хранилище
  color: Color;
  visible: boolean;
  // Может быть результатом нескольких фич
}

interface Sketch {
  id: string;
  name: string;
  plane: Plane; // на какой плоскости
  entities: SketchEntity[];
  constraints: Constraint[];
}

type SketchEntity = SketchLine | SketchCircle | SketchArc | SketchRectangle;
```

### 6.5 Подготовка к коллаборации (v2, не MVP)

**Модель sharing'а проектов** — закладывается в схему БД с первого дня, но в MVP не реализуется:

```typescript
// Таблица project_members (недоступна в MVP API, но таблица создаётся)
interface ProjectMember {
  id: string;
  projectId: string;    // FK → Project.id
  userId: string;       // FK → User.id (приглашённый пользователь)
  role: 'viewer' | 'editor';
  invitedBy: string;    // FK → User.id (кто пригласил)
  invitedAt: DateTime;
  joinedAt?: DateTime;  // null = приглашение не принято
}
```

**Запланированная схема коллаборации (v2):**
- Владелец проекта (owner) может пригласить других пользователей
- Роли: `viewer` (только просмотр) и `editor` (полное редактирование)
- Приглашение — по email пользователя
- Для реального времени (v2+) — Operational Transformation или CRDT поверх WebSocket
- В MVP: строго один owner, project_members таблица пустая, API sharing'а заблокирован

**Почему закладываем сейчас:**
- Миграция схемы БД на живом проекте с пользователями — рискованно
- Модель данных Project → owner + ProjectMember покрывает все сценарии v2 без изменения ядра
- API проектов изначально принимает user context из JWT, но проверяет только ownerId

### 6.6 Feature Tree (Timeline)

```typescript
type Feature = ExtrudeFeature | RevolveFeature | FilletFeature | ChamferFeature | BooleanFeature;

interface ExtrudeFeature {
  type: "extrude";
  sketchId: string;
  operation: "join" | "cut" | "intersect" | "new_body"; // boolean operation
  direction: "one_side" | "symmetric" | "two_sides";
  extentType: "distance" | "through_all" | "to_face";
  distance: number;
  taperAngle: number; // draft angle
}

interface FilletFeature {
  type: "fillet";
  edges: string[]; // edge IDs
  radius: number;
  type: "constant" | "variable" | "chord"; // MVP: только constant
}

interface BooleanFeature {
  type: "boolean";
  operation: "union" | "subtract" | "intersect";
  targetBodyId: string;
  toolBodyIds: string[];
}
```

### 6.7 Timeline

```typescript
interface TimelineEntry {
  id: string;
  featureId: string;
  componentId: string;
  type: string; // "extrude", "fillet", etc.
  label: string; // "Extrude 3"
  status: "ok" | "warning" | "error"; // результат регенерации
  timestamp: DateTime;
  rollbackMarker?: boolean; // для ручного возврата (как в Fusion)
}
```

### 6.8 Хранение на сервере

**PostgreSQL** — все метаданные:
- `users` — аккаунты, bcrypt-хеши паролей (nullable для OAuth-only), display_name, avatar_url
- `oauth_accounts` — привязанные OAuth-аккаунты (provider, provider_user_id), таблица создаётся с MVP, заполняется в v1
- `projects` — проекты (owner_id, name, timestamps)
- `documents` — структура документа (components, timeline в JSONB)
- `project_members` — sharing (v2), таблица создаётся с MVP но не используется

**MinIO/S3** — файлы тел, которые строит браузерное ядро (сервер их не разбирает):
- STEP тела (opaque-объект, гидрируется в Worker при открытии проекта)
- Меш с именами граней и рёбер (JSON по контракту `MeshResponse`)
- Таблица стабильных имён тела (`{bodyId}.naming.json`)
- PNG-превью проекта

**Автосохранение:**
- По таймеру: каждые 30 секунд при наличии изменений (dirty flag)
- По действию: после каждой геометрической операции (extrude, fillet, etc.)
- Клиент отправляет `PUT /api/projects/{id}/document` с полным состоянием документа
- Сервер сохраняет документ в PostgreSQL, файлы тел — в MinIO
- При конфликтах (два клиента) — optimistic locking по version полю

Почему не всё в PostgreSQL:
- STEP — большие файлы (от KB до MB)
- Меши — ещё больше для сложных тел
- S3/MinIO оптимизированы для large objects

---

## 7. UI/UX Концепция

### 7.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│ File  Edit  View  Create  Modify  Tools  Help            │ ← Menu bar
├───────────────────────────────────────┬──────────────────┤
│ [Sketch] [Extrude] [Fillet] ...       │                  │
├───────────────────────────────────────┤                  │
│                                       │   Properties     │
│                                       │   ┌────────────┐ │
│          3D VIEWPORT                  │   │ Distance:  │ │
│          (Three.js canvas)            │   │   30 mm  ▲  │ │
│                                       │   │ Operation: │ │
│                                       │   │   Join   ▼ │ │
│                                       │   └────────────┘ │
│                                       │                  │
│                                       │   Browser Tree   │
│                                       │   ┌────────────┐ │
│                                       │   │ ▼ Document │ │
│                                       │   │  ▶ Origin  │ │
│                                       │   │  ▼ Comp 1  │ │
│                                       │   │   ▶ Body1  │ │
│                                       │   │   □ Sketch1│ │
│                                       │   │   ▣ Extrude│ │
│                                       │   └────────────┘ │
├───────────────────────────────────────┴──────────────────┤
│ Timeline:  [Sketch1] → [Extrude1] → [Fillet1] → ...     │ ← Timeline
└──────────────────────────────────────────────────────────┘
```

### 7.2 Взаимодействия

- **Viewport:** Drag-орбита (middle-click или Shift+left), pan (middle-click drag), zoom (scroll). Как в Fusion 360.
- **Selection:** Левый клик — выбрать; правый клик — контекстное меню.
- **Sketcher:** Клик по плоскости в дереве или viewport → переход в режим 2D-скетча (камера выравнивается по нормали к плоскости).
- **Extrude:** Выбрать sketch → нажать Extrude → drag стрелку или ввести значение.
- **Timeline:** Клик — редактировать параметры; правый клик — delete, suppress, rollback.

### 7.3 Viewport Rendering Modes

- **Shaded** (по умолчанию) — solid + lighting
- **Shaded with edges** — solid + линии рёбер
- **Wireframe** — только рёбра
- **Hidden line removed** — как shaded with edges, но скрытые линии не показываются

Для Shaded with edges нужен edge detection на GPU. Подход: рендерить depth buffer отдельно, находить перепады (Sobel filter). Или рендерить edges как отдельный проход через геометрию.

---

## 8. План развития

### Phase 1: MVP (Core Modeling) — 12-18 месяцев

**Месяцы 1-3: Foundation**
- Настройка проекта (монорепо, CI/CD, Docker)
- FastAPI backend: OAuth2 password flow (register, token, refresh, logout, me), rate limiting
- Refresh token rotation + family tracking в Redis
- User service + project CRUD (изоляция по пользователю)
- PostgreSQL схема: users, oauth_accounts, projects, documents, project_members
- MinIO для хранения файлов тел
- Auto-save pipeline (таймер + по действию)
- Vue 3 + createSharedComposable (VueUse) + Vue Router: dashboard, editor shell
- Three.js viewport (орбита, zoom, pan, view cube) через template ref
- Базовое отображение геометрии (mesh из файла)
- Дизайн-система: CSS-переменные, базовые компоненты на zag.js (KrDialog, KrButton, KrInput)

**Месяцы 4-6: Sketcher**
- 2D Canvas скетчер (линия, круг, прямоугольник, дуга)
- Constraint solver (relaxation, базовые ограничения)
- Выбор плоскости, привязка камеры
- Сериализация/десериализация эскиза

**Месяцы 7-10: 3D Geometry Engine**
- Интеграция ядра OCCT (extrude, revolve)
- Tessellation pipeline (B-rep → mesh → вьюпорт)
- Selection (raycasting по ID граней)
- Feature tree + timeline UI

**Месяцы 11-14: Advanced Features**
- Fillet, chamfer
- Boolean operations (union, subtract, intersect)
- Timeline: редактирование параметров, regression
- Undo/Redo (command pattern)

**Месяцы 15-18: Polish & Ship**
- STEP import/export
- STL export
- Browser tree (drag & drop компонентов)
- Persistence: автосохранение + ручное сохранение
- User dashboard (список проектов, создание/удаление/переименование)
- Тестирование, оптимизация, документация

### Phase 2: v1 (Assemblies & Collaboration) — +6-9 месяцев

- Assembly constraints (mate, flush, tangent, etc.)
- Множественные компоненты, external references
- Расширенный скетчер (splines, offset, trim)
- Draft angle, shell, rib, web, pattern (linear/circular)
- Hole wizard (стандартные отверстия)
- Улучшенный constraint solver (замена на зрелый solver)
- Версионирование документов
- Коллаборация: project sharing (viewer/editor роли)
- Базовое real-time присутствие (кто ещё в проекте)

### Phase 3: v2 (Manufacturing & Simulation) — +12 месяцев

- Базовый CAM (2.5D milling)
- Базовый FEA simulation
- STL/3MF для 3D-печати
- Sheet metal (базовое)
- Фотореалистичный rendering
- Офлайн-режим (ядро уже работает в браузере; нужно локальное хранение документа)

---

## 9. Риски и критические точки

### 9.1 🔴 Критические риски

| Риск | Вероятность | Влияние | Митигация |
|------|-----------|---------|-----------|
| **OCCT нестабилен на сложной геометрии** | Средняя | Критическое | MVP только простая геометрия; fallback — сообщение пользователю о невозможности операции |
| **Constraint solver слишком медленный/нестабильный** | Высокая | Высокое | Начать с упрощённого solver; план Б — SolveSpace WASM |
| **Tessellation performance** | Средняя | Высокое | Хранение мешей рядом со STEP; LOD; тесселяция в Web Worker |
| **Производительность рендеринга (много тел)** | Средняя | Среднее | Instanced rendering; frustum culling; LOD |
| **Команда не справляется с объёмом** | Средняя | Критическое | Агрессивный скоуп MVP; только проверенные технологии |
| **Refresh token replay attack** | Низкая | Критическое | Refresh token family tracking; при обнаружении replay → вся family инвалидируется; атомарная ротация (Lua-скрипт в Redis); refresh token только в httpOnly cookie |

### 9.2 🟡 Умеренные риски

| Риск | Митигация |
|------|-----------|
| **STEP import quality** | Использовать OCCT ShapeHealing; показывать warnings о проблемах |
| **Fillet fails на сложной топологии** | Документировать ограничения; предлагать альтернативы |
| **Большой размер WASM (~23 МБ, ~7 МБ gzip)** | Кэширование навсегда по хешу в имени; предсжатие; custom build OCCT; CDN |
| **Память и скорость слабых устройств** | Лимиты модели, перезапуск Worker с гидрацией тел из STEP (`lib/browserKernel.ts`) |
| **Конкурентное редактирование (multi-user)** | Optimistic locking; CRDT для параметров; MVP — lock-based |
| **Утечка проектов между пользователями** | Все запросы проверяют ownerId из access token; integration-тесты на изоляцию |
| **Auto-save конфликты (несколько вкладок)** | Optimistic locking по version; UI предупреждает о конфликте |
| **OAuth2 provider compromise (Yandex ID, v1)** | Минимизация scope; короткоживущие токены провайдера; шифрование токенов в БД |

### 9.3 🟢 Приемлемые ограничения

- Нет офлайн-режима в MVP
- Нет мобильных клиентов
- Нет импорта из проприетарных форматов (SLDPRT, F3D)
- Только современные браузеры (Chrome, Firefox, Edge последних 2 версий)
- Нет коллаборации (sharing, совместное редактирование) — архитектура заложена, но не реализована
- Нет OAuth/Yandex ID/Google логина — архитектура заложена (oauth_accounts таблица, OAuth2 authorize endpoint заглушка), но в MVP только password grant
- Один пользователь = один аккаунт; привязка нескольких OAuth-провайдеров — v1

---

## 10. Технологические решения (обоснование)

### 10.1 Серверное геометрическое ядро vs WASM

| Критерий | Серверное ядро | WASM на клиенте (выбрано) |
|----------|----------------|---------------------------|
| Производительность | Нативное C++ | ~70-80% нативной, но без сетевого запроса и очереди |
| Размер загрузки | 0 | ~23 МБ WASM (~7 МБ gzip), кэшируется |
| Офлайн-работа | Нет | Возможна |
| Масштабирование | Нужны серверы под CPU-bound геометрию | Бесплатно (клиент) |
| Ограничения | — | Память и скорость устройства |

**Решение:** MVP начинался с серверного ядра pythonOCC. С сентября 2026 ядро только в браузере (OCCT/WASM в Web Worker через `replicad`); серверного fallback нет.

### 10.2 Three.js vs другие 3D-библиотеки

Three.js выбран потому что:
- Зрелая (r185+, 10+ лет разработки)
- WebGL 2.0 + WebGPU support (через TSL)
- Огромное сообщество, тысячи примеров
- Низкоуровневый контроль над render loop (важно для CAD)
- Хорошая поддержка post-processing, selection buffer, raycasting

### 10.3 Vue 3 vs другие UI-фреймворки

Vue 3 выбран потому что:
- Composition API даёт реактивность из коробки (ref/reactive/computed) без ручного управления зависимостями
- Single File Components (template + script + style) — естественная организация кода
- createSharedComposable из VueUse как реактивное глобальное состояние — обычные composables, никаких отдельных сторов, легковеснее
- Тонкий контроль над Three.js через template ref (как и React useRef, но с автоматической очисткой)
- Меньше риск «хукового ада» (useMemo/useCallback в React) за счёт автоматической реактивности
- zag.js имеет официальный Vue-адаптер (@zag-js/vue) — логика машин одна и та же, разница только в адаптере

### 10.4 Формат файла проекта

Собственный формат, основанный на glTF с расширениями:

```json
{
  "asset": { "version": "1.0", "generator": "Крометра" },
  "metadata": { "name": "...", "author": "...", "createdAt": "..." },
  "components": [...],
  "timeline": [...],
  "extensions": {
    "CAD_STUDIO_brep": {
      "files": ["body_1.brep", "body_2.brep"]
    },
    "CAD_STUDIO_features": {
      "features": [...]
    }
  }
}
```

Почему не чистый STEP:
- STEP не хранит timeline/feature tree
- STEP не хранит UI-состояние
- Но мы поддерживаем STEP для импорта/экспорта

---

## 11. API Дизайн (ключевые эндпоинты)

### 11.1 Аутентификация (OAuth2)

Авторизация построена по стандарту OAuth 2.0 (RFC 6749). В MVP реализован только `password` grant; PKCE (RFC 7636) появится вместе с `authorization_code`. Архитектура готова к `authorization_code` flow для Yandex ID в v1.

```
# Регистрация (не часть OAuth2, вспомогательный эндпоинт)
POST /api/auth/register
  Request:  { email: str, password: str, displayName?: str }
  Response: 201 { user: User }
  Note:     После регистрации клиент должен пройти OAuth2 password flow для получения токенов

# OAuth2 Token Endpoint (RFC 6749 §4.3 — Password Grant)
POST /api/auth/token
  Content-Type: application/x-www-form-urlencoded
  Request:  grant_type=password
            &username={email}
            &password={password}
  Response: 200 {
              access_token: str,     # JWT, 15 мин
              token_type: "bearer",
              expires_in: 900
            }                        # refresh token — только в httpOnly cookie
  Cookies:  Set-Cookie: refresh_token={opaque};
              HttpOnly; Secure; SameSite=Strict;
              Path=/api/auth; Max-Age=2592000
  Error:    400 { error: "invalid_grant", error_description: "..." }
            429 { error: "rate_limited", error_description: "..." } + Retry-After

# OAuth2 Token Refresh (RFC 6749 §6 — Refreshing an Access Token)
POST /api/auth/token
  Content-Type: application/x-www-form-urlencoded
  Request:  grant_type=refresh_token
            cookie refresh_token          # только из httpOnly cookie, в теле не принимается
  Response: 200 {
              access_token: str,
              token_type: "bearer",
              expires_in: 900
            }
  Cookies:  Set-Cookie: refresh_token={новый} (как выше)
  Side effect: старый refresh_token → статус "replaced" в Redis family
  Error:    400 { error: "invalid_grant" }
           Если токен уже был использован (replay) → вся family инвалидируется

# Logout (frontend convenience — вызывает revocation + очищает cookie)
POST /api/auth/logout
  Request:  cookie refresh_token (читается сервером из httpOnly cookie)
  Response: 204 No Content
  Cookies:  Set-Cookie: refresh_token=; Max-Age=0 (очистка cookie)
  Side effect: вызов revocation для всей family пользователя

# Текущий пользователь
GET  /api/auth/me
  Headers:  Authorization: Bearer <access_token>
  Response: { user: User }
  401:      { error: "invalid_token" }

# Для будущего Yandex ID (v1): OAuth2 Authorization Endpoint
GET  /api/auth/authorize
  Query:    response_type=code
            &client_id={app_id}
            &redirect_uri={...}
            &scope=openid+email+profile
            &code_challenge={...}
            &code_challenge_method=S256
            &provider=yandex        # какой OIDC-провайдер
  Response: 302 редирект на Yandex OAuth / авторизацию
  
  # После редиректа обратно — обменять code на токены:
  POST /api/auth/token
    Request:  grant_type=authorization_code
              &code={code_from_provider}
              &redirect_uri={...}
              &code_verifier={PKCE verifier}
    Response: стандартный TokenResponse (как выше)
```

**JWT Access Token:**
- Алгоритм: HS256
- Payload: `{ sub: userId, email, iat, exp, jti: unique_id }`
- Время жизни: 15 минут
- Передаётся в заголовке `Authorization: Bearer <token>`

**Refresh Token (opaque):**
- Случайная 256-битная строка (не JWT — нельзя расшифровать на клиенте)
- Хранится в httpOnly Secure SameSite cookie (недоступен JavaScript → защита от XSS)
- Время жизни: 30 дней
- При каждом refresh: старый инвалидируется, выдаётся новый (полная ротация)
- Family tracking в Redis (см. §4.3 «Refresh token family tracking»)

**Rate limiting (Redis, `core/rate_limit.py`):**
- Вход: 10 неудачных попыток в минуту с IP и 5 неудачных за 15 минут на email → 429 + `Retry-After`
- Регистрация: 10 в час с IP; refresh: 300 в минуту с IP
- IP клиента берётся из `X-Forwarded-For`/`X-Real-IP` только если запрос пришёл от доверенного прокси (`TRUSTED_PROXIES`)
- Для несуществующего email bcrypt всё равно выполняется по фиктивному хэшу — тайминг не выдаёт наличие аккаунта

**На клиенте (Vue):**
- `useAuth` composable (createSharedComposable) хранит access_token только в памяти (не localStorage!)
- Refresh token автоматически отправляется браузером через httpOnly cookie
- Axios/fetch интерсептор: при 401 → POST `/api/auth/token` с grant_type=refresh_token → повтор запроса
- При загрузке приложения: нет access_token → пробуем refresh → если нет cookie или просрочен → редирект на логин
- При logout: POST `/api/auth/logout` → очистка authStore → редирект на логин

### 11.2 Проекты

Все эндпоинты требуют `Authorization: Bearer <access_token>`.

```
GET    /api/projects                    # Список проектов текущего пользователя
  Response: { projects: Project[] }
  Access:   Только проекты, где ownerId = currentUser.id (из access token JWT)
  Query:    ?sort=updated&order=desc

POST   /api/projects                    # Создать проект
  Request:  { name: str, description?: str }
  Response: 201 { project: Project }

GET    /api/projects/{id}               # Получить проект (метаданные + документ)
  Response: { project: Project }
  403:     Проект не принадлежит пользователю

PUT    /api/projects/{id}               # Обновить (переименовать)
  Request:  { name?: str, description?: str }
  Response: { project: Project }

DELETE /api/projects/{id}               # Удалить проект (каскадно: document + B-rep)
  Response: 204 No Content
```

### 11.3 Документы (CAD-данные проекта)

```
GET    /api/projects/{id}/document      # Получить CAD-документ проекта
  Response: { document: Document, version: int }

PUT    /api/projects/{id}/document      # Автосохранение
  Request:  { document: Document, version: int }
  Response: { document: Document, version: int }
  409:     Конфликт версий (optimistic locking)
```

### 11.4 Экспорт / Импорт

```
Экспорт STEP/STL выполняет Worker в браузере, сервер в нём не участвует.
Импорт STEP пока не реализован.
```

### 11.5 Геометрические операции

Геометрию строит Worker в браузере. Сервер принимает результат операции и сохраняет его — файлы тел и запись timeline — с проверкой владельца и версии документа:

```
POST   /api/projects/{id}/geometry/browser-extrude
POST   /api/projects/{id}/geometry/browser-revolve
POST   /api/projects/{id}/geometry/browser-boolean
POST   /api/projects/{id}/geometry/browser-fillet
POST   /api/projects/{id}/geometry/browser-chamfer
POST   /api/projects/{id}/geometry/browser-thread
POST   /api/projects/{id}/geometry/browser-rebuild      # замена цепочки тел после правки параметров
GET    /api/projects/{id}/geometry/{bodyId}/mesh
GET    /api/projects/{id}/geometry/{bodyId}/browser-step
GET    /api/projects/{id}/geometry/{bodyId}/browser-naming
```

Точные схемы — в OpenAPI backend (`/docs`) и сгенерированных типах `web/src/types/api.generated.ts`.

---

## 12. Инфраструктура

### Development
- Монорепо: `web/` + `backend/` в одном репо
- Docker Compose для локальной разработки (PostgreSQL, Redis, MinIO, backend, frontend dev server)
- hot reload на фронте и бэке

### Deployment (MVP)
- Backend: Docker контейнер на VPS/VDS (Hetzner, DigitalOcean)
- Frontend: статический хостинг (CloudFlare Pages / Vercel / Nginx)
- Базы данных: managed PostgreSQL (или Docker на том же сервере для MVP)
- MinIO: Docker на том же сервере (MVP)

---

## 13. Ключевые метрики успеха MVP

1. **Регистрация и вход:** пользователь может зарегистрироваться, войти через OAuth2 password flow, обновить access token через refresh, выйти (с инвалидацией всей refresh family)
2. **Изоляция проектов:** пользователь видит только свои проекты, чужие недоступны (проверено тестами)
3. **Создание модели:** пользователь может создать 3D-тело из sketch + extrude за <5 минут с нуля
4. **Редактирование:** изменение параметра extrude в timeline перестраивает модель корректно
5. **Fillet/Chamfer:** работает на простых телах (куб, цилиндр) без ошибок
6. **Boolean:** union, subtract, intersect работают на простых телах
7. **Export:** STEP экспорт открывается в FreeCAD/Fusion 360 без ошибок
8. **Автосохранение:** изменения сохраняются на сервер автоматически, данные не теряются при закрытии браузера
9. **Performance:** модель из 20+ features загружается и регенерируется за <5 секунд
10. **Браузерная совместимость:** Chrome, Firefox, Edge последних версий

---

## 14. Заключение

Крометра — амбициозный проект, но архитектура выбрана реалистичная. Мы не изобретаем геометрическое ядро с нуля (это заняло бы 10+ лет), а используем зрелый OpenCASCADE, собранный в WebAssembly и работающий прямо в браузере. Мы не строим свой 3D-движок, а используем Three.js. Мы пишем упрощённый constraint solver для MVP, а не пытаемся конкурировать с D-Cubed (Dassault). Многопользовательская архитектура закладывается с первого дня, чтобы v1/v2 могли добавить коллаборацию без переписывания ядра.

**Главный вызов не в коде, а в сложности предметной области.** Геометрическое моделирование — это десятки тысяч краевых случаев. Ключ к успеху — строгий скоуп MVP и постоянное тестирование на реальных моделях.

---

_Этот документ — отправная точка. По мере реализации он будет уточняться и дополняться._
