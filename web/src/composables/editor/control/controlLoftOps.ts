import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import type { EditorControlContext } from "./controlContext";
import { applyControlFeature, FEATURE_RESULT } from "./controlFeatureResult";

export function loftOps(context: EditorControlContext): ControlOp[] {
  const { loft } = context;
  return [
    defineOp({
      op: "loft",
      description: `Лофт - тело через два и более профиля из эскизов на разных плоскостях, панель «Лофт». Профиль - ровно один замкнутый контур эскиза без отверстий; профили с разным числом сторон (квадрат и круг) допустимы. Порядок sketchIds - порядок профилей вдоль тела. Ошибка профиля или ядра приходит operation_failed с объяснением. Правка любого эскиза-профиля перестраивает тело, переход (params.transition: smooth | ruled) правится в свойствах операции. Имена граней: боковые - по сторонам первого профиля, торцы - start и end. ${FEATURE_RESULT}`,
      mutates: true,
      params: {
        sketchIds: param.list(param.id("Эскиз-профиль из op state."), "Эскизы-профили по порядку, минимум два, без повторов.", 2),
        operation: param.optional(param.oneOf(["new_body", "join", "cut"], "new_body - новое тело (по умолчанию), join - приклеить к телу, cut - вырезать из тела.")),
        targetBodyId: param.optional(param.id("Тело для join и cut, обязательно для них.")),
        ruled: param.optional(param.boolean("true - линейный переход между соседними профилями, false - гладкий (по умолчанию).")),
      },
      run: async ({ sketchIds, operation, targetBodyId, ruled }) => {
        if (new Set(sketchIds).size !== sketchIds.length) throw fail("invalid_params", "Эскизы в sketchIds не должны повторяться.");
        if (operation !== undefined && operation !== "new_body" && targetBodyId === undefined) {
          throw fail("invalid_params", "Для join и cut задайте targetBodyId.");
        }
        sketchIds.forEach((sketchId) => context.requireSketch(sketchId));
        if (targetBodyId !== undefined) context.bodyMesh(targetBodyId);
        context.leaveTools();
        loft.enter();
        loft.configure({ profileSketchIds: sketchIds, operation, targetBodyId, ruled });
        return applyControlFeature(context, loft.apply, () => loft.error.value, loft.exit);
      },
    }),
  ];
}
