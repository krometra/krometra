import { errorHint } from "../channel.mjs";
import { EXPORT_FORMATS, EXPORT_QUALITY_PROPERTIES, exportParams } from "../export.mjs";
import { ToolError } from "../errors.mjs";
import { prose, text } from "../toolKit.mjs";

const UPLOAD_PLACEHOLDER = "upload";

export function createRemoteFileTools({ editor, session, files, uploads, publicUrl, ttlMinutes }) {
  return [
    {
      def: {
        name: "cad_export",
        description: prose(
          "Экспортировать модель открытого проекта в STL, STEP или 3MF. Файл собирает вкладка редактора, сервер кладёт его",
          `во временное хранилище и возвращает ссылку url на ${ttlMinutes} минут: скачай её командой из поля download`,
          "(ключ доступа не нужен, ссылка одноразово случайная). Без body_ids в файл идут все видимые тела;",
          "с body_ids - ровно названные тела. Отдельный STL на каждое тело получают отдельными вызовами.",
          "Точность сетки STL и 3MF задают quality либо tolerance и angle_deg.",
          "Модель не меняет.",
        ),
        inputSchema: {
          type: "object",
          properties: {
            format: { type: "string", enum: EXPORT_FORMATS, description: "Формат файла." },
            body_ids: { type: "array", items: { type: "string" }, description: "id тел из cad_state. По умолчанию - все видимые." },
            ...EXPORT_QUALITY_PROPERTIES,
          },
          required: ["format"],
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      handler: async (args) => {
        const exported = await editor.query("export", exportParams(args));
        const bytes = Buffer.from(exported.dataBase64, "base64");
        const token = files.put({ ownerId: await session.userId(), filename: exported.filename, mime: exported.mime, bytes });
        const url = `${publicUrl}/mcp/files/${token}`;
        return {
          content: [text({ url, filename: exported.filename, bytes: bytes.length, mime: exported.mime, download: `curl -fsSL -o '${exported.filename.replaceAll("'", "")}' '${url}'` })],
        };
      },
    },
    {
      def: {
        name: "cad_import",
        description: prose(
          "Импортировать STEP-файл в открытый проект: каждое твёрдое тело файла становится отдельным телом документа",
          "(запись истории kind = import). Два шага: 1) вызови без upload_id - получишь одноразовую ссылку upload и",
          "готовую команду curl, загрузи ею файл с диска; 2) вызови снова с upload_id - тела появятся в модели.",
          `Ссылка живёт ${ttlMinutes} минут, предел файла - 50 МБ. Отменяется history.undo.`,
        ),
        inputSchema: {
          type: "object",
          properties: { upload_id: { type: "string", description: "id загрузки из первого вызова cad_import." } },
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      handler: async (args) => {
        const ownerId = await session.userId();
        if (typeof args.upload_id !== "string" || !args.upload_id) {
          const uploadId = uploads.put({ ownerId, filename: null, mime: null, bytes: null });
          const url = `${publicUrl}/mcp/uploads/${uploadId}`;
          return {
            content: [text({ uploadId, upload: url, command: `curl -fsS -X PUT --data-binary @<путь к файлу.step> -H 'X-File-Name: <имя.step>' '${url}'`, next: `cad_import { "upload_id": "${uploadId}" }` })],
          };
        }
        const upload = uploads.take(args.upload_id, ownerId);
        if (!upload?.bytes) throw new ToolError(`Загрузка ${args.upload_id} не найдена, просрочена или файл ещё не загружен: начни заново с cad_import без параметров.`);
        const reply = await editor.request("import.step", { fileName: upload.filename ?? `${UPLOAD_PLACEHOLDER}.step`, dataBase64: upload.bytes.toString("base64") });
        if (reply.ok) return { content: [text(reply)] };
        return { content: [text(reply), text(errorHint(reply))].filter((block) => block.text), isError: true };
      },
    },
  ];
}
