import { DEFAULT_DRAFT_ANGLE_DEG } from "@/lib/browserDraft";
import { DRAFT_NEUTRAL_EXPECTED, readDraftNeutral } from "@/lib/control/draftNeutral";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import type { EditorControlContext } from "./controlContext";
import { applyControlFeature, FEATURE_RESULT, requireVisibleBody } from "./controlFeatureResult";

export function draftOps(context: EditorControlContext): ControlOp[] {
  const { draft } = context;

  return [
    defineOp({
      op: "draft",
      description: "Уклон граней - панель «Уклон»: наклоняет перечисленные грани на угол относительно нейтральной плоскости, "
        + "линия пересечения грани с нейтралью остаётся на месте. Направление вытягивания - нормаль базовой плоскости "
        + "(XY - +Z, XZ - +Y, YZ - +X) или нормаль нейтральной грани вглубь тела; по нему тело сужается, reverse = true "
        + "меняет сторону (тело расширяется). Наклоняются плоские, цилиндрические и конические грани; касательные соседи "
        + "грани ядро наклоняет вместе с ней. Грань, параллельная нейтрали, неплоская нейтраль и слишком большой угол "
        + "отклоняются ошибкой operation_failed с причиной, тело не меняется. Исходное тело скрывается, результат - новое тело; "
        + `грани сохраняют свои id. ${FEATURE_RESULT}`,
      mutates: true,
      params: {
        bodyId: param.id("Видимое тело из op state."),
        faceIds: param.list(param.id("Идентификатор грани."), "Грани тела из op topology или face.find, которые нужно наклонить: [id, …], хотя бы одна."),
        neutral: param.object("Нейтральная плоскость: { plane: XY | XZ | YZ } через начало координат или { faceId } плоской грани этого тела.", DRAFT_NEUTRAL_EXPECTED, readDraftNeutral),
        angleDeg: param.optional(param.number(`Угол уклона в градусах, по умолчанию ${DEFAULT_DRAFT_ANGLE_DEG}.`, { above: 0 })),
        reverse: param.optional(param.boolean("true - обратное направление вытягивания: тело расширяется. По умолчанию false.")),
      },
      run: async ({ bodyId, faceIds, neutral, angleDeg, reverse }) => {
        requireVisibleBody(context, bodyId);
        const faces = faceIds.map((faceId) => String(context.bodyFace(bodyId, faceId).faceId));
        if (neutral.kind === "face") context.bodyFace(bodyId, neutral.faceId);
        context.leaveTools();
        draft.enter();
        draft.setNeutral(bodyId, neutral);
        draft.selectFaces(bodyId, faces);
        draft.setAngle(angleDeg ?? DEFAULT_DRAFT_ANGLE_DEG);
        draft.setReverse(reverse ?? false);
        return applyControlFeature(context, draft.apply, () => draft.error.value ?? draft.angle.error.value, draft.exit);
      },
    }),
  ];
}
