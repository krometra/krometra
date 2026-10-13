import { errorHint } from "./channel.mjs";
import { ToolError } from "./errors.mjs";
import { EXPORT_FORMATS, refuseExisting, resolveTarget, saveExport } from "./export.mjs";
import { captureLabeled, captureViewport } from "./snapshot.mjs";

const LABEL_KINDS = ["none", "edges", "faces"];
const LABEL_TEXTS = ["id", "number"];
const EDITOR_LINK = /\/editor\/([\w-]+)/;
const NO_PARAMS = { type: "object", properties: {} };
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

const prose = (...sentences) => sentences.join(" ");
const text = (value) => ({ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) });
const image = (shot) => ({ type: "image", data: shot.dataBase64, mimeType: shot.mime });

function requireString(args, name) {
  const value = typeof args[name] === "string" ? args[name].trim() : "";
  if (!value) throw new ToolError(`Параметр ${name} обязателен (непустая строка).`);
  return value;
}

function optionalObject(args, name) {
  const value = args[name];
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolError(`Параметр ${name} должен быть объектом.`);
  }
  return value;
}

function optionalIdList(args, name) {
  const value = args[name];
  if (value === undefined) return undefined;
  const isIdList = Array.isArray(value) && value.length > 0 && value.every((id) => typeof id === "string" && id);
  if (!isIdList) throw new ToolError(`Параметр ${name}: непустой массив id либо не указывай параметр вовсе.`);
  return value;
}

function choice(args, name, allowed, fallback) {
  const value = args[name] ?? fallback;
  if (!allowed.includes(value)) throw new ToolError(`Параметр ${name}: допустимо ${allowed.join(" | ")}.`);
  return value;
}

function projectIdFrom(reference) {
  return EDITOR_LINK.exec(reference)?.[1] ?? reference;
}

function withoutInlineBinary(reply) {
  const { dataBase64: data, mime } = reply.result ?? {};
  if (typeof data !== "string" || !data) return [text(reply)];
  const isImage = typeof mime === "string" && mime.startsWith("image/");
  const note = isImage
    ? `<${data.length} символов base64 вынесено в изображение ниже>`
    : `<${data.length} символов base64 скрыто: это не изображение. Чтобы сохранить файл на диск, вызови cad_export>`;
  const summary = text({ ...reply, result: { ...reply.result, dataBase64: note } });
  return isImage ? [summary, image({ mime, dataBase64: data })] : [summary];
}

export function createTools({ session, editor }) {
  return [
    {
      def: {
        name: "cad_list_projects",
        description: prose(
          "Список проектов пользователя Крометры: id, имя, описание, дата изменения.",
          "С него начинается работа: id проекта нужен для cad_open_project. Браузер не запускает.",
        ),
        inputSchema: NO_PARAMS,
        annotations: READ_ONLY,
      },
      handler: async () => ({ content: [text({ projects: await session.listProjects() })] }),
    },
    {
      def: {
        name: "cad_create_project",
        description:
          "Создать пустой проект Крометры. Возвращает его id: дальше открой проект через cad_open_project.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Имя проекта, 1-255 символов." },
            description: { type: "string", description: "Описание проекта, до 1024 символов." },
          },
          required: ["name"],
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      handler: async (args) => {
        const project = await session.createProject({
          name: requireString(args, "name"),
          description: args.description || undefined,
        });
        return { content: [text(project)] };
      },
    },
    {
      def: {
        name: "cad_open_project",
        description: prose(
          "Открыть проект в живом редакторе Крометры и дождаться готовности: редактор смонтирован,",
          "документ загружен, геометрическое ядро поднято.",
          "Обязательный первый шаг перед cad_capabilities, cad_state, cad_request и cad_snapshot.",
          "Первый вызов запускает браузер и грузит WASM-ядро: обычно это секунды, на холодном dev-сервере до минуты.",
          "Вызов с другим проектом переключает редактор на него, с тем же - перезагружает страницу.",
          "Сразу после открытия прочитай cad_capabilities.",
        ),
        inputSchema: {
          type: "object",
          properties: {
            project_id: {
              type: "string",
              description: "id проекта из cad_list_projects или ссылка вида /editor/<id>.",
            },
          },
          required: ["project_id"],
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      handler: async (args) => {
        const project = await session.getProject(projectIdFrom(requireString(args, "project_id")));
        const { url, channelVersion } = await editor.open(project.id);
        return { content: [text({ project, url, channelVersion })] };
      },
    },
    {
      def: {
        name: "cad_capabilities",
        description: prose(
          "Какие операции умеет канал управления открытого редактора прямо сейчас: имя op, описание,",
          "мутирует ли она модель, параметры с типами и обязательностью.",
          "Единственный источник правды об операциях: прочитай его после cad_open_project и перед первым",
          "cad_request, имена операций и параметров не угадывай.",
        ),
        inputSchema: NO_PARAMS,
        annotations: READ_ONLY,
      },
      handler: async () => ({ content: [text(await editor.query("capabilities"))] }),
    },
    {
      def: {
        name: "cad_state",
        description: prose(
          "Состояние открытого редактора: projectId, режим (mode), готовность ядра, версия и dirty документа,",
          "тела (id, имя, видимость), эскизы, timeline операций с параметрами и статусом, флаг busy.",
          "Вызывай после каждой мутирующей операции, чтобы убедиться в результате.",
          "id тел отсюда нужны для topology и cad_snapshot.",
        ),
        inputSchema: NO_PARAMS,
        annotations: READ_ONLY,
      },
      handler: async () => ({ content: [text(await editor.query("state"))] }),
    },
    {
      def: {
        name: "cad_request",
        description: prose(
          "Выполнить операцию канала управления редактора: { op, params } передаётся как есть, ответ возвращается",
          "как есть - { ok: true, op, result } или { ok: false, op, error: { code, message } }.",
          "Имена op и параметры бери из cad_capabilities.",
          "Все координаты и размеры - в миллиметрах, в системе координат модели.",
          "Примеры чтения: topology { bodyId } - грани и рёбра тела со стабильными id и координатами,",
          "camera.get, camera.set { position, target }, sketch.get.",
          "Мутирующие операции выполняются по одной: код busy значит, что редактор занят,",
          "повтори вызов через 1-2 секунды.",
          "Остальные коды: unknown_op и invalid_params - сверься с cad_capabilities; wrong_mode - смотри mode",
          "в cad_state; not_found - устарел id; not_ready - редактор не готов; operation_failed - ядро не построило",
          "геометрию.",
          "После мутации проверь результат через cad_state или cad_snapshot.",
          "Для снимка вьюпорта используй cad_snapshot, а не viewport.capture; для экспорта модели в файл -",
          "cad_export, а не export: бинарные данные, кроме изображений, в ответ cad_request не передаются.",
        ),
        inputSchema: {
          type: "object",
          properties: {
            op: { type: "string", description: 'Имя операции из cad_capabilities, например "topology".' },
            params: { type: "object", description: "Параметры операции по её описанию в cad_capabilities." },
          },
          required: ["op"],
        },
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      },
      handler: async (args) => {
        const reply = await editor.request(requireString(args, "op"), optionalObject(args, "params"));
        if (reply.ok) return { content: withoutInlineBinary(reply) };
        return { content: [text(reply), text(errorHint(reply))].filter((block) => block.text), isError: true };
      },
    },
    {
      def: {
        name: "cad_snapshot",
        description: prose(
          "Снимок 3D-вьюпорта открытого редактора (PNG) - посмотреть модель и проверить результат операции.",
          "labels=edges или labels=faces подписывает на снимке id рёбер или граней тела body_id и добавляет",
          "текстовую легенду: точный id каждого объекта, координаты в мм (концы ребра либо точка на грани",
          "и её нормаль) и пиксель метки at.",
          "Эти id передавай в операции над рёбрами и гранями (скругление, фаска и другие из cad_capabilities).",
          "Подписываются все объекты в кадре, включая заслонённые телом: выбирай объект по координатам из легенды.",
          'Ракурс меняется через cad_request { op: "camera.set", params: { position, target } }.',
          "Если подписи сливаются, приблизь камеру или поставь label_text=number: на снимке будут номера,",
          "id - в легенде.",
        ),
        inputSchema: {
          type: "object",
          properties: {
            labels: { type: "string", enum: LABEL_KINDS, description: "Что подписать на снимке. По умолчанию none." },
            body_id: {
              type: "string",
              description:
                "id тела из cad_state, чьи рёбра или грани подписать. Можно не указывать, если видимое тело одно.",
            },
            label_text: {
              type: "string",
              enum: LABEL_TEXTS,
              description: "Текст метки: id объекта (по умолчанию) или порядковый номер из легенды.",
            },
          },
        },
        annotations: READ_ONLY,
      },
      handler: async (args) => {
        const kind = choice(args, "labels", LABEL_KINDS, "none");
        const labelText = choice(args, "label_text", LABEL_TEXTS, "id");
        if (kind === "none") return { content: [image(await captureViewport(editor))] };
        const { shot, legend } = await captureLabeled(editor, { kind, bodyId: args.body_id, labelText });
        return { content: [image(shot), text(legend)] };
      },
    },
    {
      def: {
        name: "cad_export",
        description: prose(
          "Экспортировать модель открытого проекта в файл STL или STEP на диск: сервер получает файл от редактора,",
          "пишет его по пути path и возвращает путь, размер в байтах, mime и имя файла из редактора.",
          "Без body_ids в файл идут все видимые тела, как у кнопки «Экспорт»; с body_ids - ровно названные тела.",
          "Отдельный STL на каждое тело (например для печати) получают отдельными вызовами с одним id в body_ids.",
          "path - абсолютный путь файла (.stl либо .step или .stp) или каталога: каталогом считается существующий",
          "каталог, путь с завершающим слэшем и путь без расширения. Каталог создаётся при необходимости,",
          "имя файла в каталоге даёт редактор.",
          "Существующий файл не перезаписывается без overwrite: true.",
          "Модель не меняет; код busy значит, что редактор занят, повтори вызов позже.",
        ),
        inputSchema: {
          type: "object",
          properties: {
            format: { type: "string", enum: EXPORT_FORMATS, description: "Формат файла." },
            path: { type: "string", description: "Абсолютный путь файла или каталога на диске." },
            body_ids: {
              type: "array",
              items: { type: "string" },
              description: "id тел из cad_state. По умолчанию - все видимые тела.",
            },
            overwrite: { type: "boolean", description: "Перезаписать существующий файл. По умолчанию false." },
          },
          required: ["format", "path"],
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      handler: async (args) => {
        const format = choice(args, "format", EXPORT_FORMATS);
        const bodyIds = optionalIdList(args, "body_ids");
        const overwrite = args.overwrite === true;
        const target = await resolveTarget(requireString(args, "path"), format);
        await refuseExisting(target, overwrite);
        const exported = await editor.query("export", bodyIds ? { format, bodyIds } : { format });
        return { content: [text(await saveExport({ target, exported, overwrite }))] };
      },
    },
  ];
}

export const INSTRUCTIONS = prose(
  "Сервер управляет живым редактором Крометры (браузерная параметрическая 3D CAD) через страницу в браузере.",
  "Порядок работы: 1) cad_list_projects или cad_create_project;",
  "2) cad_open_project - без него остальные инструменты не работают;",
  "3) cad_capabilities - какие операции доступны и с какими параметрами;",
  "4) cad_state и cad_snapshot - прочитать модель;",
  "5) cad_request - выполнить операцию;",
  "6) снова cad_state или cad_snapshot - проверить результат.",
  "Координаты и размеры - в миллиметрах, в системе координат модели.",
  "Код ошибки busy значит повторить вызов позже.",
  "id рёбер и граней для операций бери из cad_snapshot с подписями или из cad_request topology.",
  "Файл STL или STEP на диск сохраняет cad_export.",
);
