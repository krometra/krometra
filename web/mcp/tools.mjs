import { errorHint } from "./channel.mjs";
import { summarizeSection } from "./section.mjs";
import { captureLabeled, captureViewport } from "./snapshot.mjs";
import { NO_PARAMS, READ_ONLY, choice, image, optionalIdList, optionalObject, prose, requireString, text } from "./toolKit.mjs";

const LABEL_KINDS = ["none", "edges", "faces"];
const LABEL_TEXTS = ["id", "number"];
const EDITOR_LINK = /\/editor\/([\w-]+)/;
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

export function createTools({ session, editor, fileTools }) {
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
          "Локальный сервер при первом вызове запускает браузер и грузит WASM-ядро: обычно секунды, на холодном",
          "dev-сервере до минуты; вызов с другим проектом переключает редактор, с тем же - перезагружает страницу.",
          "Удалённый сервер работает через вкладку редактора, открытую у пользователя: если её нет, вызов ждёт до",
          "минуты и отвечает ссылкой на проект - передай её пользователю и повтори вызов, когда он откроет вкладку.",
          "Сразу после открытия прочитай cad_capabilities.",
          "Если в ответе есть watchUrl - это ссылка для человека: открыв её в своём браузере, он видит модель",
          "вживую в режиме наблюдения (без правок и автосохранения, чтобы не мешать). Предложи её пользователю.",
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
        return { content: [text({ project, ...(await editor.open(project.id)) })] };
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
          "в cad_state; not_found - устарел id; not_ready - редактор не готов; operation_failed - операция отклонена",
          "по существу (параметры или геометрия), повтор не поможет; save_failed - геометрия построена, но сервер её",
          "не сохранил (сбой связи): модель не изменилась, повтори ту же операцию через 10-20 секунд.",
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
          "body_ids показывает на снимке только эти тела (остальные временно скрываются, документ не меняется):",
          "так снимают отдельный компонент. Различать тела помогает цвет: op body.setColor.",
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
            body_ids: {
              type: "array",
              items: { type: "string" },
              description: "Показать на снимке только эти тела. По умолчанию - все видимые.",
            },
          },
        },
        annotations: READ_ONLY,
      },
      handler: async (args) => {
        const kind = choice(args, "labels", LABEL_KINDS, "none");
        const labelText = choice(args, "label_text", LABEL_TEXTS, "id");
        const bodyIds = optionalIdList(args, "body_ids");
        const bodyId = args.body_id ?? (bodyIds?.length === 1 ? bodyIds[0] : undefined);
        if (bodyIds) await editor.query("viewport.isolate", { bodyIds });
        try {
          if (kind === "none") return { content: [image(await captureViewport(editor))] };
          const { shot, legend } = await captureLabeled(editor, { kind, bodyId, labelText });
          return { content: [image(shot), text(legend)] };
        } finally {
          if (bodyIds) await editor.query("viewport.isolate", {});
        }
      },
    },
    {
      def: {
        name: "cad_section",
        description: prose(
          "Сечение модели плоскостью: картинка контуров (тела разными цветами) и их геометрия -",
          "замкнутость, площадь, длина и габарит каждого контура в мм в координатах плоскости.",
          "Так проверяют зазоры, толщины стенок и отверстия без экспорта STL.",
          "plane - XY, XZ или YZ, offset - смещение вдоль нормали плоскости (XY - по Z).",
          "Точки контуров в ответ попадают только с points: true.",
        ),
        inputSchema: {
          type: "object",
          properties: {
            plane: { type: "string", enum: ["XY", "XZ", "YZ"], description: "Базовая плоскость сечения." },
            offset: { type: "number", description: "Смещение плоскости в мм. По умолчанию 0." },
            body_ids: { type: "array", items: { type: "string" }, description: "Тела из cad_state. По умолчанию - все видимые." },
            points: { type: "boolean", description: "Вернуть точки контуров. По умолчанию false." },
          },
          required: ["plane"],
        },
        annotations: READ_ONLY,
      },
      handler: async (args) => {
        const bodyIds = optionalIdList(args, "body_ids");
        const params = { plane: choice(args, "plane", ["XY", "XZ", "YZ"]) };
        if (typeof args.offset === "number") params.offset = args.offset;
        if (bodyIds) params.bodyIds = bodyIds;
        const section = await editor.query("section", { ...params, image: true });
        const summary = text(summarizeSection(section, args.points === true));
        return { content: section.image ? [image(section.image), summary] : [summary] };
      },
    },
    ...fileTools,
  ];
}

export const INSTRUCTIONS = prose(
  "Сервер управляет живым редактором Крометры (браузерная параметрическая 3D CAD) через страницу в браузере:",
  "у локального сервера - своя фоновая, у удалённого - открытая вкладка пользователя.",
  "Порядок работы: 1) cad_list_projects или cad_create_project;",
  "2) cad_open_project - без него остальные инструменты не работают;",
  "3) cad_capabilities - какие операции доступны и с какими параметрами;",
  "4) cad_state и cad_snapshot - прочитать модель;",
  "5) cad_request - выполнить операцию;",
  "6) снова cad_state или cad_snapshot - проверить результат.",
  "Координаты и размеры - в миллиметрах, в системе координат модели.",
  "Код ошибки busy значит повторить вызов позже.",
  "id рёбер и граней для операций бери из cad_snapshot с подписями, из cad_request topology или face.find,",
  "торец только что выдавленного тела - из capFaceIds ответа extrude.",
  "Тело на высоте: эскиз на смещённой плоскости sketch.create { plane, offset }.",
  "Ошибку отменяет history.undo; лишнее убирают body.delete, timeline.delete, sketch.delete.",
  "Файлы: cad_export (STL, STEP, 3MF) и cad_import (STEP); проверка внутренностей - cad_section.",
);
