export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldErrors;
  // Совместимость с кодом, который читает ошибку как { error, error_description }
  readonly error: string;
  readonly error_description: string;

  constructor(status: number, code: string, message: string, fields: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.error = code;
    this.error_description = message;
  }
}

export const SAVE_FAILED_MESSAGE =
  "Геометрия построена, но сервер её не сохранил: нет связи или сервер недоступен. Модель не изменилась — повторите операцию через 10–20 секунд.";

export function saveFailure(cause: ApiError): ApiError {
  return new ApiError(cause.status, "save_failed", SAVE_FAILED_MESSAGE);
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "Запрос отклонён сервером.",
  401: "Неверная почта или пароль.",
  403: "Нет доступа к этому объекту.",
  404: "Объект не найден — возможно, он уже удалён.",
  409: "Объект изменился в другой вкладке. Обновите страницу.",
  413: "Файл слишком большой.",
  429: "Слишком много запросов подряд. Подождите немного.",
  500: "Сервер не смог выполнить операцию. Попробуйте ещё раз.",
  502: "Сервер недоступен. Попробуйте через минуту.",
  503: "Сервер недоступен. Попробуйте через минуту.",
  504: "Сервер не ответил вовремя.",
};

// Бэкенд отвечает кодом + английским описанием; коды стабильны, тексты — нет,
// поэтому известные коды переводим здесь, а незнакомые показываем как есть.
const CODE_MESSAGES: Record<string, string> = {
  invalid_grant: "Неверная почта или пароль.",
  invalid_token: "Сессия истекла — войдите заново.",
  invalid_client: "Приложение не прошло проверку. Обновите страницу.",
  unsupported_grant_type: "Способ входа не поддерживается.",
  email_taken: "Этот адрес почты уже занят.",
  user_exists: "Этот адрес почты уже занят.",
  rate_limited: "Слишком много попыток. Подождите и повторите.",
  version_conflict: "Документ изменён в другой вкладке. Обновите страницу.",
  sketch_not_found: "Эскиз не найден — возможно, он удалён.",
  body_not_found: "Тело не найдено — возможно, оно удалено.",
  mesh_not_found: "Геометрия тела не загрузилась. Обновите страницу.",
  face_not_found: "Грань больше не существует после перестроения.",
  project_not_found: "Проект не найден.",
  network_error: "Нет связи с сервером. Проверьте подключение.",
  api_key_limit: "Достигнут лимит ключей доступа. Удалите ненужный ключ, чтобы создать новый.",
  api_key_not_found: "Ключ доступа не найден — возможно, он уже удалён.",
  api_key_session_forbidden: "Ключами доступа можно управлять только после входа по паролю.",

  // Геометрия. Бэкенд шлёт английский текст с деталями — здесь короткий
  // русский смысл и следующий шаг; подробности из error_description
  // подставляются там, где они полезнее общей фразы (см. detailedCodes).
  brep_not_found: "Геометрия тела не найдена. Перестройте операцию заново.",
  empty_result: "Результат операции пуст — инструмент не пересекает тело.",
  no_volume_change: "Операция не изменила тело — инструмент его не задел. Проверьте расстояние и «Реверс».",
  boolean_failed: "Булева операция не удалась на этой геометрии. Попробуйте изменить положение тел.",
  fillet_failed: "Скругление не строится с таким радиусом. Уменьшите радиус или выберите другие рёбра.",
  chamfer_failed: "Фаска не строится с такими размерами. Уменьшите их или выберите другие рёбра.",
  zero_distance: "Расстояние выдавливания не может быть нулевым.",
  through_all_new_body: "«Насквозь» работает только с «Приклеить» или «Вырезать». Для нового тела задайте расстояние.",
  target_required: "Выберите целевое тело для операции.",
  unknown_target_body: "Целевое тело не найдено — возможно, документ изменён в другой вкладке. Выберите тело заново.",
  stale_target_body: "Целевое тело устарело: его поглотила предыдущая операция. Выберите тело заново в дереве.",
  occ_not_available: "Геометрическое ядро недоступно на сервере. Сообщите администратору.",

  // Экспорт/импорт
  no_visible_bodies: "Нечего экспортировать: в документе нет видимых тел.",
  empty_file: "Файл пуст — выберите другой.",
  empty_step: "В STEP-файле нет геометрии.",
  invalid_step: "Не удалось прочитать STEP-файл — возможно, он повреждён.",
  invalid_file: "Файл не подходит для импорта.",
  invalid_extension: "Неподдерживаемый формат файла. Нужен STEP (.step или .stp).",
  import_no_bodies: "В STEP-файле нет тел для импорта.",
  too_many_import_bodies: "В файле слишком много тел для одного импорта — разделите модель на несколько файлов.",
  import_bodies_mismatch: "Импорт не сохранён: браузерное ядро передало тела не полностью. Повторите импорт.",
  invalid_request: "Некорректный запрос — проверьте параметры операции.",

  // Выдавливание «до грани» и перестроение операции
  up_to_face_required: "Выберите грань, до которой выдавливать.",
  up_to_target_required: "Выберите browser-тело или его грань, до которых выдавливать.",
  up_to_face_invalid: "До этой грани выдавливать нельзя — она лежит в плоскости эскиза. Выберите другую.",
  invalid_extrude_params: "Параметры выдавливания недопустимы — проверьте расстояние и направление.",
  entry_not_found: "Операция не найдена в дереве — возможно, она удалена.",
  unsupported_kind: "Эту операцию пока нельзя перестроить: поддерживаются выдавливание и вращение.",
  invalid_entry: "Операция повреждена: у неё нет эскиза или тела. Постройте её заново.",

  // Резьба и отмена операции «на месте»
  thread_failed: "Резьба не строится на этой грани. Проверьте шаг, глубину и длину.",
  snapshot_missing: "Снимок тела до операции не найден — отменить её на месте нельзя.",
  nothing_to_restore: "Отменять нечего: тело уже в исходном состоянии.",

  // Браузерное ядро (OCCT/WASM)
  invalid_revolve_params: "Параметры вращения недопустимы — проверьте ось и угол.",
  invalid_sweep_params: "Параметры протяжки недопустимы: профиль и путь должны быть в разных эскизах, ориентация — без закрутки или по Френе.",
  invalid_boolean_params: "Параметры булевой операции недопустимы — выберите два разных тела.",
  invalid_browser_mesh: "Браузерное ядро вернуло повреждённую сетку. Повторите операцию.",
  empty_browser_step: "Браузерное ядро не вернуло геометрию. Повторите операцию.",
  browser_step_too_large: "Модель слишком велика для сохранения (STEP больше 10 МБ).",
  browser_mesh_too_large: "Модель слишком велика для сохранения (сетка больше 50 МБ).",
  browser_step_not_found: "Геометрия browser-тела не найдена на сервере.",
  target_changed: "Целевое тело изменилось во время построения. Выберите тело заново.",
  target_not_browser: "Браузерное ядро может изменять только тела, построенные в браузере.",
  invalid_thread_params: "Параметры резьбы недопустимы — проверьте шаг, глубину, длину и число заходов.",
  invalid_transform_params: "Параметры перемещения недопустимы — задайте сдвиг или поворот с ненулевой осью.",
  invalid_shell_params: "Параметры оболочки недопустимы — толщина стенки больше нуля, направление внутрь или наружу.",
  invalid_face_ids: "Выберите хотя бы одну грань, которую оболочка откроет.",
  invalid_mirror_params: "Параметры зеркала недопустимы — выберите базовую плоскость XY, XZ, YZ или плоскую грань тела.",
  mixed_browser_export_unsupported: "Экспорт пока не смешивает browser-тела и серверные тела.",
  multiple_browser_export_unsupported: "Экспорт нескольких browser-тел пока недоступен — объедините их или скройте лишние.",
  invalid_edge_ids: "Выберите хотя бы одно ребро тела.",
  invalid_entry_ids: "Некорректный список операций скругления.",
  fillet_run_changed: "Скругления в истории изменились во время построения. Повторите операцию.",
  invalid_edge_feature: "Размеры скругления или фаски должны быть больше нуля.",
  browser_naming_too_large: "Таблица имён граней слишком велика для сохранения.",
  invalid_browser_naming: "Браузерное ядро вернуло повреждённую таблицу имён граней. Повторите операцию.",
  invalid_feature_key: "Некорректный ключ операции браузерного ядра.",
  browser_naming_not_found: "Таблица имён граней browser-тела не найдена на сервере.",
  invalid_rebuild_params: "Недопустимые параметры операции — проверьте значения.",
  rebuild_unsupported: "От этой операции зависит операция, которую браузерное ядро пока не пересобирает.",
  rebuild_bodies_mismatch: "История изменилась во время пересборки. Повторите изменение.",
  rebuild_sketches_mismatch: "Эскизы на гранях изменились во время пересборки. Обновите страницу и повторите изменение.",
  invalid_sketch_plane: "Браузерное ядро вернуло повреждённую плоскость эскиза. Повторите изменение.",
  browser_mesh_too_complex: "Модель слишком детализирована для сохранения: слишком много вершин, граней или рёбер.",
  too_many_rebuild_bodies: "Изменение затрагивает слишком много тел — пересоберите модель по частям.",
  rebuild_params_too_large: "Параметры пересборки слишком велики для сохранения.",
  invalid_body_id: "Некорректный идентификатор тела. Обновите страницу.",
  invalid_sketch_id: "Некорректный идентификатор эскиза. Обновите страницу.",

  // Лимиты и квоты
  request_too_large: "Запрос слишком большой для сервера — упростите модель.",
  document_too_large: "Документ проекта слишком большой (больше 5 МБ) — упростите историю или разделите проект.",
  storage_quota_exceeded: "Закончилось место в хранилище. Удалите ненужные проекты.",
};

// Коды, где сервер знает больше нас: точные числа (максимальный радиус,
// имя ребра) полезнее общей фразы, поэтому показываем описание сервера,
// а перевод выше остаётся запасным вариантом.
const DETAILED_CODES = new Set([
  "fillet_failed",
  "chamfer_failed",
  "no_volume_change",
  "empty_result",
  "rate_limited",
  "storage_quota_exceeded",
  "request_too_large",
]);

const FIELD_LABELS: Record<string, string> = {
  email: "Почта",
  password: "Пароль",
  display_name: "Имя",
  name: "Название",
  description: "Описание",
  username: "Почта",
  radius: "Радиус",
  distance: "Расстояние",
  distance1: "Расстояние 1",
  distance2: "Расстояние 2",
  angle: "Угол",
};

const VALIDATION_MESSAGES: { match: RegExp; text: (ctx: MessageContext) => string }[] = [
  { match: /^Value error, (.+)$/s, text: ({ groups }) => groups[1] },
  { match: /valid email/i, text: () => "Введите корректный адрес почты." },
  { match: /field required/i, text: ({ label }) => `${label}: заполните это поле.` },
  {
    match: /at least (\d+) characters?/i,
    text: ({ label, groups }) => `${label}: минимум ${groups[1]} символов.`,
  },
  {
    match: /at most (\d+) characters?/i,
    text: ({ label, groups }) => `${label}: не длиннее ${groups[1]} символов.`,
  },
  {
    match: /greater than or equal to (\S+)/i,
    text: ({ label, groups }) => `${label}: значение не меньше ${groups[1]}.`,
  },
  {
    match: /greater than (\S+)/i,
    text: ({ label, groups }) => `${label}: значение больше ${groups[1]}.`,
  },
  {
    match: /less than or equal to (\S+)/i,
    text: ({ label, groups }) => `${label}: значение не больше ${groups[1]}.`,
  },
  { match: /valid (number|integer|float)/i, text: ({ label }) => `${label}: введите число.` },
  { match: /should be a valid/i, text: ({ label }) => `${label}: недопустимое значение.` },
];

interface MessageContext {
  label: string;
  groups: RegExpMatchArray;
}

interface PydanticError {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
}

function fieldOf(item: PydanticError): string {
  const loc = item.loc ?? [];
  const last = [...loc].reverse().find((p) => typeof p === "string" && p !== "body" && p !== "query");
  return typeof last === "string" ? last : "";
}

function humanizeValidation(item: PydanticError): string {
  const field = fieldOf(item);
  const label = FIELD_LABELS[field] ?? (field || "Значение");
  const raw = item.msg ?? "";
  for (const rule of VALIDATION_MESSAGES) {
    const groups = raw.match(rule.match);
    if (groups) return rule.text({ label, groups });
  }
  return raw ? `${label}: ${raw}` : `${label}: недопустимое значение.`;
}

function isPydanticList(value: unknown): value is PydanticError[] {
  return Array.isArray(value) && value.every((v) => typeof v === "object" && v !== null);
}

export function toApiError(status: number, body: unknown, fallback: string): ApiError {
  const payload = (body ?? {}) as Record<string, unknown>;
  const detail = payload["detail"];

  // FastAPI-валидация: [{loc, msg, type}, …] — самый частый источник «молчаливых» 422
  if (isPydanticList(detail)) {
    const fields: FieldErrors = {};
    for (const item of detail) {
      const field = fieldOf(item);
      if (field && !fields[field]) fields[field] = humanizeValidation(item);
    }
    const first = detail[0] ? humanizeValidation(detail[0]) : fallback;
    return new ApiError(status, "validation_error", first, fields);
  }

  if (typeof detail === "string" && detail) {
    return new ApiError(status, "error", detail);
  }

  const source =
    typeof detail === "object" && detail !== null ? (detail as Record<string, unknown>) : payload;
  const code = String(source["error"] ?? payload["error"] ?? "error");
  const described = source["error_description"] ?? source["message"];
  const detailText = typeof described === "string" && described ? described : null;
  const message =
    (DETAILED_CODES.has(code) ? detailText : null) ??
    CODE_MESSAGES[code] ??
    detailText ??
    STATUS_MESSAGES[status] ??
    fallback;

  return new ApiError(status, code, message);
}

export function errorMessage(err: unknown, fallback = "Что-то пошло не так."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  const e = err as { error_description?: string; detail?: unknown; error?: string } | null;
  if (typeof e?.error_description === "string") return e.error_description;
  if (typeof e?.detail === "string") return e.detail;
  return fallback;
}
