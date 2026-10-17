import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { constraintGlyphs } from "@/sketcher/constraintGlyphs";
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

  function glyphsOnPage() {
    context.requireSketchMode();
    const view = context.sketcherRef.value?.getCanvas();
    const element = view?.getCanvasEl();
    if (!view || !element) throw fail("not_ready", "Канвас эскиза ещё не смонтирован.");
    const rect = element.getBoundingClientRect();
    return constraintGlyphs(sketch.constraints.value, sketch.entities.value, 1 / view.getZoom()).map((glyph) => {
      const screen = view.worldToScreen(glyph.at.x, glyph.at.y);
      return { constraintId: glyph.constraintId, type: glyph.type, text: glyph.text, at: glyph.at, x: rect.left + screen.x, y: rect.top + screen.y };
    });
  }

  return [
    defineOp({
      op: "sketch.constraintGlyphs",
      description:
        "Значки геометрических ограничений на холсте открытого эскиза. Возвращает [{ constraintId, type, text, at, x, y }]: at — точка значка в мм эскиза, " +
        "x, y — клиентские координаты страницы. У ограничения на паре объектов (equal, parallel) по значку у каждого. Только в режиме эскиза.",
      run: glyphsOnPage,
    }),

    defineOp({
      op: "sketch.deleteConstraint",
      description:
        "Удаляет ограничение или размер из открытого эскиза одним шагом истории (как Delete по выбранному значку) и решает эскиз. " +
        "id — из sketch.get (constraints). Возвращает { constraintId, residual, entities }.",
      mutates: true,
      params: { constraintId: param.string("id ограничения.") },
      run: ({ constraintId }) => {
        context.requireSketchMode();
        if (!sketch.constraints.value.some((c) => c.id === constraintId)) throw fail("not_found", `В эскизе нет ограничения «${constraintId}».`);
        sketch.applyCanvasEdit(sketch.entities.value, sketch.constraints.value.filter((c) => c.id !== constraintId));
        return solved(constraintId);
      },
    }),

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
