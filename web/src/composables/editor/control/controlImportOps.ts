import { base64ToBytes } from "@/lib/control/base64";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import type { EditorControlContext } from "./controlContext";

export function importOps(context: EditorControlContext): ControlOp[] {
  return [
    defineOp({
      op: "import.step",
      description:
        "Импортирует тела из STEP-файла — то же, что кнопка «Импорт STEP»: каждое твёрдое тело файла становится отдельным телом документа с записью истории kind = import. Отменяется history.undo. Возвращает { bodyIds, timeline: [запись], mode }. Файл с диска передаёт инструмент MCP cad_import; через cad_request — dataBase64.",
      mutates: true,
      params: {
        fileName: param.string("Имя файла с расширением .step или .stp — по нему подписывается запись истории."),
        dataBase64: param.string("Содержимое STEP-файла в base64."),
      },
      run: async ({ fileName, dataBase64 }) => {
        const bytes = base64ToBytes(dataBase64);
        if (!bytes) throw fail("invalid_params", "Параметр «dataBase64»: ожидается содержимое файла в base64.");
        context.leaveTools();
        const known = new Set(context.model.timelineEntries.value.map((entry) => entry.id));
        const bodyIds = await context.stepImport.importStep(new File([bytes], fileName, { type: "application/step" }));
        return {
          bodyIds,
          timeline: context.model.timelineEntries.value.filter((entry) => !known.has(entry.id)).map(context.timelineEntry),
          mode: context.mode(),
        };
      },
    }),
  ];
}
