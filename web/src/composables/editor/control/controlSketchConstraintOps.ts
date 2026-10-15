import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import {
  CONSTRAINT_TYPE_NAMES,
  SKETCH_CONSTRAINT_HELP,
  buildSketchConstraint,
  constraintAnchorsParam,
  updatedConstraintValue,
} from "@/lib/control/sketchConstraints";
import type { EditorControlContext } from "./controlContext";

export function sketchConstraintOps(context: EditorControlContext): ControlOp[] {
  const { sketch } = context;

  async function solved(constraintId: string) {
    await sketch.solve();
    return { constraintId, residual: sketch.solveResidual.value, entities: sketch.entities.value };
  }

  return [
    defineOp({
      op: "sketch.addConstraint",
      description:
        `Добавляет ограничение или размер в открытый эскиз одним шагом истории и решает эскиз. ${SKETCH_CONSTRAINT_HELP} ` +
        "Пример: расстояние 20 мм между отрезками l1 и l2 — { type: \"line_distance\", anchors: [{ entityId: \"l1\" }, { entityId: \"l2\" }], value: 20 }. " +
        "Возвращает { constraintId, residual, entities } — residual около нуля, если ограничения выполнены.",
      mutates: true,
      params: {
        type: param.oneOf(CONSTRAINT_TYPE_NAMES, "Тип ограничения."),
        anchors: constraintAnchorsParam("Якоря: [{ entityId, point? }] — один или два, порядок важен."),
        value: param.optional(param.number("Значение размера: мм, у angle — градусы.")),
      },
      run: ({ type, anchors, value }) => {
        context.requireSketchMode();
        const constraint = buildSketchConstraint({ type, anchors, value }, sketch.entities.value, `control-constraint-${Date.now()}`);
        sketch.applyCanvasEdit(sketch.entities.value, [...sketch.constraints.value, constraint]);
        return solved(constraint.id);
      },
    }),

    defineOp({
      op: "sketch.setConstraintValue",
      description:
        "Меняет значение размера в открытом эскизе (как двойной клик по подписи размера) одним шагом истории и решает эскиз. " +
        "id размера — из sketch.get (constraints). Возвращает { constraintId, residual, entities }.",
      mutates: true,
      params: {
        constraintId: param.string("id размерного ограничения."),
        value: param.number("Новое значение: мм, у angle — градусы."),
      },
      run: ({ constraintId, value }) => {
        context.requireSketchMode();
        sketch.applyCanvasEdit(sketch.entities.value, updatedConstraintValue(sketch.constraints.value, constraintId, value));
        return solved(constraintId);
      },
    }),
  ];
}
