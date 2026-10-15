import { errorHint } from "./channel.mjs";
import { EXPORT_FORMATS, EXPORT_QUALITY_PROPERTIES, exportParams, refuseExisting, resolveTarget, saveExport } from "./export.mjs";
import { readStepFile } from "./import.mjs";
import { prose, requireString, text } from "./toolKit.mjs";

export function createLocalFileTools({ editor }) {
  return [
    {
      def: {
        name: "cad_export",
        description: prose(
          "Экспортировать модель открытого проекта в файл STL, STEP или 3MF на диск: сервер получает файл от редактора,",
          "пишет его по пути path и возвращает путь, размер в байтах, mime и имя файла из редактора.",
          "Без body_ids в файл идут все видимые тела, как у кнопки «Экспорт»; с body_ids - ровно названные тела.",
          "Отдельный STL на каждое тело (например для печати) получают отдельными вызовами с одним id в body_ids.",
          "3MF - архив для слайсеров: по объекту на тело, единицы мм. Точность сетки STL и 3MF задают quality",
          "либо tolerance и angle_deg; для STEP они не нужны.",
          "path - абсолютный путь файла (.stl, .3mf либо .step или .stp) или каталога: каталогом считается существующий",
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
            ...EXPORT_QUALITY_PROPERTIES,
          },
          required: ["format", "path"],
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      handler: async (args) => {
        const params = exportParams(args);
        const overwrite = args.overwrite === true;
        const target = await resolveTarget(requireString(args, "path"), params.format);
        await refuseExisting(target, overwrite);
        const exported = await editor.query("export", params);
        return { content: [text(await saveExport({ target, exported, overwrite }))] };
      },
    },
    {
      def: {
        name: "cad_import",
        description: prose(
          "Импортировать STEP-файл с диска в открытый проект: каждое твёрдое тело файла становится отдельным телом",
          "документа (запись истории kind = import), как у кнопки «Импорт STEP». Готовую модель покупного компонента",
          "(плата, разъём, двигатель) удобнее импортировать, чем перерисовывать.",
          "Возвращает { bodyIds, timeline, mode }. Отменяется history.undo. Предел файла - 50 МБ.",
        ),
        inputSchema: {
          type: "object",
          properties: { path: { type: "string", description: "Абсолютный путь к файлу .step или .stp на диске." } },
          required: ["path"],
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      handler: async (args) => {
        const file = await readStepFile(requireString(args, "path"));
        const reply = await editor.request("import.step", file);
        if (reply.ok) return { content: [text(reply)] };
        return { content: [text(reply), text(errorHint(reply))].filter((block) => block.text), isError: true };
      },
    },
  ];
}
