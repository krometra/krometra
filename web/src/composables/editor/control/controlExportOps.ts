import { bytesToBase64 } from "@/lib/control/base64";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { ANGLE_RANGE_DEG, TOLERANCE_RANGE, explicitQuality } from "@/lib/meshQuality";
import type { EditorControlContext } from "./controlContext";

export function exportOps(context: EditorControlContext, busyReason: () => string | null): ControlOp[] {
  return [
    defineOp({
      op: "export",
      description:
        "Экспортирует тела из браузерного ядра в файл — тот же путь, что кнопка «Экспорт». Возвращает { mime, filename, dataBase64 }: STEP — текст ISO-10303-21 (mime application/step), STL — бинарный (mime model/stl), 3MF — zip с 3D/3dmodel.model в миллиметрах, по объекту на тело (mime model/3mf); всё в base64. Без bodyIds в файл идут все видимые тела, как у кнопки, и файл называется по проекту; с bodyIds — ровно названные тела (скрытые тоже), их имена добавляются к имени файла: так получают отдельный STL на каждое тело для печати. Качество сетки STL и 3MF: quality (по умолчанию normal — допуск 0.01 мм, угол 0.5 рад) или свои tolerance и angleDeg поверх пресета; для STEP не используется. Модель не меняет; пока редактор занят операцией, отвечает busy.",
      params: {
        format: param.oneOf(["step", "stl", "3mf"], "Формат файла."),
        bodyIds: param.optional(
          param.list(param.id("Идентификатор тела."), "Тела из op state: [id, …]. По умолчанию — все видимые тела."),
        ),
        quality: param.optional(
          param.oneOf(["draft", "normal", "high"], "Пресет качества сетки: draft — 0.1 мм и 30°, normal — 0.01 мм и ~28.6°, high — 0.002 мм и 6°."),
        ),
        tolerance: param.optional(param.number("Линейный допуск сетки, мм; заменяет допуск пресета.", TOLERANCE_RANGE)),
        angleDeg: param.optional(param.number("Угловой допуск сетки, градусы; заменяет угол пресета.", ANGLE_RANGE_DEG)),
      },
      run: async ({ format, bodyIds, quality, tolerance, angleDeg }) => {
        const reason = busyReason();
        if (reason) throw fail("busy", reason);
        const known = new Set(context.model.bodies.value.map((body) => body.id));
        const missing = (bodyIds ?? []).filter((bodyId) => !known.has(bodyId));
        if (missing.length > 0) {
          throw fail("not_found", `В документе нет тел: ${missing.join(", ")}. Список тел — op "state".`);
        }
        const file = await context.exportApi.buildFile(format, bodyIds, explicitQuality({ preset: quality, tolerance, angleDeg }));
        return { mime: file.mime, filename: file.filename, dataBase64: bytesToBase64(new Uint8Array(file.buffer)) };
      },
    }),
  ];
}
