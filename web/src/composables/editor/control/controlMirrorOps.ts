import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { requestedMirrorPlane } from "@/lib/control/mirrorRequest";
import { MIRROR_BASE_PLANES } from "@/lib/mirrorPlane";
import { bodyLineage } from "./controlBodyOps";
import type { EditorControlContext } from "./controlContext";

export function mirrorOps(context: EditorControlContext): ControlOp[] {
  return [
    defineOp({
      op: "body.mirror",
      description:
        "Зеркально отражает тело относительно базовой плоскости XY, XZ или YZ (со смещением offset вдоль её нормали) либо плоской грани самого тела — то же, что панель «Зеркало». Это операция истории: в timeline появляется запись kind = mirror, её plane и offset потом правятся в дереве с пересборкой зависимых операций. merge = false (по умолчанию) — результат новое тело-копия, исходное остаётся видимым; merge = true — отражение объединяется с исходным в одно тело, исходное поглощается и скрывается (как у join). Грани отражения получают новые стабильные id, при объединении грани исходного тела сохраняют свои. Неплоская грань — operation_failed. Отменяется history.undo. Возвращает { bodyId, feature, mode }: bodyId — тело-результат.",
      mutates: true,
      params: {
        bodyId: param.id("Видимое тело из op state."),
        plane: param.optional(param.oneOf(MIRROR_BASE_PLANES, "Базовая плоскость зеркала.")),
        offset: param.optional(param.number("Смещение базовой плоскости вдоль её нормали в мм (XY — по Z, XZ — по Y, YZ — по X). По умолчанию 0.")),
        faceId: param.optional(param.id("Плоская грань этого же тела из op topology: отражение относительно её плоскости. Вместо plane.")),
        merge: param.optional(param.boolean("true — объединить отражение с исходным телом. По умолчанию false — новое тело.")),
      },
      run: async ({ bodyId, plane, offset, faceId, merge }) => {
        const target = requestedMirrorPlane(plane, offset, faceId);
        if (target.kind === "face") context.bodyFace(bodyId, target.faceId);
        else context.bodyMesh(bodyId);
        if (bodyLineage(context)(bodyId).consumedBy !== null) {
          throw fail("operation_failed", `Тело «${bodyId}» уже поглощено операцией: отражайте его результат (replacedBy в op state).`);
        }
        context.leaveTools();
        const known = new Set(context.model.timelineEntries.value.map((entry) => entry.id));
        const resultId = await context.mirror.run(bodyId, target, merge === true);
        const feature = context.model.timelineEntries.value.find((entry) => !known.has(entry.id));
        return { bodyId: resultId, feature: feature ? context.timelineEntry(feature) : null, mode: context.mode() };
      },
    }),
  ];
}
