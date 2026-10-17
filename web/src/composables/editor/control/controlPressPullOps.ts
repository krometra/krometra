import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import type { EditorControlContext } from "./controlContext";
import { applyControlFeature, FEATURE_RESULT, requireVisibleBody } from "./controlFeatureResult";

export function pressPullOps(context: EditorControlContext): ControlOp[] {
  const { pressPull } = context;

  return [
    defineOp({
      op: "pressPull",
      description: `Сдвигает грани тела по нормали на смещение со знаком — панель «Сдвиг грани» (Press-Pull). Плюс — грань уходит наружу (тело растёт, отверстие сужается), минус — внутрь (тело худеет, отверстие расширяется): зазор под посадку, например -0.07. Поддерживаются плоские и цилиндрические грани; соседние грани продлеваются или подрезаются до сдвинутой. Сдвинутая грань и соседи сохраняют свои id. newBody = true — «Выдавить грань»: грань как профиль выдавливается на смещение в новое тело, исходное остаётся видимым. Без newBody исходное тело скрывается, результат — новое тело. Смещение правится в истории (params.distance) с пересборкой зависимых, отменяется history.undo. Неподдержанная грань или слишком глубокий сдвиг внутрь — operation_failed с объяснением. ${FEATURE_RESULT}`,
      mutates: true,
      params: {
        bodyId: param.id("Видимое тело из op state."),
        faceIds: param.list(param.id("Идентификатор грани."), "Грани тела из op topology или face.find: [id, …], хотя бы одна."),
        distance: param.number("Смещение в мм со знаком: плюс наружу по нормали грани, минус внутрь. Не ноль."),
        newBody: param.optional(param.boolean("true — выдавить грани в новое тело. По умолчанию false — сдвинуть грани самого тела.")),
      },
      run: async ({ bodyId, faceIds, distance, newBody }) => {
        requireVisibleBody(context, bodyId);
        const faces = faceIds.map((faceId) => context.bodyFace(bodyId, faceId).faceId);
        context.leaveTools();
        pressPull.enter();
        pressPull.selectFaces(bodyId, faces);
        pressPull.distanceField.set(distance);
        pressPull.setNewBody(newBody === true);
        return applyControlFeature(context, pressPull.apply, () => pressPull.error.value ?? pressPull.distanceField.error.value, pressPull.exit);
      },
    }),
  ];
}
