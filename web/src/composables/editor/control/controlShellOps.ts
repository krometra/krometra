import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import type { EditorControlContext } from "./controlContext";
import { applyControlFeature, FEATURE_RESULT, requireVisibleBody } from "./controlFeatureResult";

export function shellOps(context: EditorControlContext): ControlOp[] {
  const { shell } = context;

  return [
    defineOp({
      op: "shell",
      description: `Делает тело полым — панель «Оболочка»: убирает перечисленные грани (они станут открытыми проёмами) и оставляет стенку заданной толщины. Исходное тело скрывается, результат — новое тело. Слишком толстая стенка отклоняется ошибкой operation_failed с толщиной, которая помещается. ${FEATURE_RESULT}`,
      mutates: true,
      params: {
        bodyId: param.id("Видимое тело из op state."),
        faceIds: param.list(param.id("Идентификатор грани."), "Грани тела из op topology или face.find, которые оболочка откроет: [id, …], хотя бы одна."),
        thickness: param.number("Толщина стенки в мм.", { above: 0 }),
        direction: param.optional(
          param.oneOf(["inward", "outward"], "inward — стенка внутрь, габарит тела сохраняется (по умолчанию); outward — стенка наружу, тело становится полостью."),
        ),
      },
      run: async ({ bodyId, faceIds, thickness, direction }) => {
        requireVisibleBody(context, bodyId);
        const faces = faceIds.map((faceId) => context.bodyFace(bodyId, faceId).faceId);
        context.leaveTools();
        shell.enter();
        shell.selectFaces(bodyId, faces);
        shell.setThickness(thickness);
        shell.setDirection(direction ?? "inward");
        return applyControlFeature(context, shell.apply, () => shell.error.value, shell.exit);
      },
    }),
  ];
}
