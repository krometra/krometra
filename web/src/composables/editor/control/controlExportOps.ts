import { bytesToBase64 } from "@/lib/control/base64";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import type { EditorControlContext } from "./controlContext";

export function exportOps(context: EditorControlContext, busyReason: () => string | null): ControlOp[] {
  return [
    defineOp({
      op: "export",
      description:
        "Экспортирует тела из браузерного ядра в файл — тот же путь, что кнопка «Экспорт». Возвращает { mime, filename, dataBase64 }: STEP — текст ISO-10303-21 (mime application/step), STL — бинарный (mime model/stl), оба в base64. Без bodyIds в файл идут все видимые тела, как у кнопки, и файл называется по проекту; с bodyIds — ровно названные тела (скрытые тоже), их имена добавляются к имени файла: так получают отдельный STL на каждое тело для печати. Модель не меняет; пока редактор занят операцией, отвечает busy.",
      params: {
        format: param.oneOf(["step", "stl"], "Формат файла."),
        bodyIds: param.optional(
          param.list(param.id("Идентификатор тела."), "Тела из op state: [id, …]. По умолчанию — все видимые тела."),
        ),
      },
      run: async ({ format, bodyIds }) => {
        const reason = busyReason();
        if (reason) throw fail("busy", reason);
        const known = new Set(context.model.bodies.value.map((body) => body.id));
        const missing = (bodyIds ?? []).filter((bodyId) => !known.has(bodyId));
        if (missing.length > 0) {
          throw fail("not_found", `В документе нет тел: ${missing.join(", ")}. Список тел — op "state".`);
        }
        const file = await context.exportApi.buildFile(format, bodyIds);
        return { mime: file.mime, filename: file.filename, dataBase64: bytesToBase64(new Uint8Array(file.buffer)) };
      },
    }),
  ];
}
