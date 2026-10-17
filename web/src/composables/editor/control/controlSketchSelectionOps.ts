import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { CONSTRAINT_TYPE_NAMES } from "@/lib/control/sketchConstraints";
import {
  SKETCH_SELECTION_HELP,
  describeSelection,
  selectionConstraints,
  selectionTargets,
  sketchSelectionParam,
} from "@/lib/control/sketchSelection";
import type { EditorControlContext } from "./controlContext";

export function sketchSelectionOps(context: EditorControlContext): ControlOp[] {
  const { sketch } = context;

  function canvasSelection() {
    context.requireSketchMode();
    const selection = context.sketcherRef.value?.selection;
    if (!selection) throw fail("not_ready", "Канвас эскиза ещё не смонтирован.");
    return selection;
  }

  function selectionState() {
    return { selection: describeSelection(canvasSelection().items.value, sketch.entities.value) };
  }

  return [
    defineOp({
      op: "sketch.select",
      description:
        `Выделяет в открытом эскизе объекты, точки, оси и начало координат — как клики инструментом «Выбор». ${SKETCH_SELECTION_HELP} ` +
        "append: true добавляет к текущему выделению, иначе заменяет его; пустой items снимает выделение. Возвращает { selection }.",
      params: {
        items: sketchSelectionParam("Что выделить: [{ entityId, point? }]."),
        append: param.optional(param.boolean("Добавить к текущему выделению вместо замены.")),
      },
      run: ({ items, append }) => {
        const selection = canvasSelection();
        selectionTargets(items, sketch.entities.value);
        selection.set(append ? [...selection.items.value, ...items] : items);
        return selectionState();
      },
    }),

    defineOp({
      op: "sketch.getSelection",
      description: "Текущее выделение в открытом эскизе: [{ kind: entity|point|axis|origin, entityId, point?, at?, label? }].",
      params: {},
      run: () => selectionState(),
    }),

    defineOp({
      op: "sketch.constrainSelection",
      description:
        "Ставит ограничение на текущее выделение эскиза — как кнопка панели ограничений — одним шагом истории и решает эскиз. " +
        "Номера точек берутся из выделения: совпадение двух точек, середины отрезка и начала координат, горизонталь двух точек. " +
        "distance выбирает тип размера по выделению (длина, расстояние между параллельными, от точки до прямой или ребра грани, угол, диаметр); " +
        "value — значение размера в мм или градусах, без него берётся текущее. Возвращает { constraintIds, residual, entities }.",
      mutates: true,
      params: {
        type: param.oneOf(CONSTRAINT_TYPE_NAMES, "Тип ограничения, как на панели: horizontal, vertical, coincident, parallel, perpendicular, equal, distance, radius, angle."),
        value: param.optional(param.number("Значение размера: мм, у angle — градусы.")),
      },
      run: async ({ type, value }) => {
        const selection = canvasSelection();
        const targets = selectionTargets(selection.items.value, sketch.entities.value);
        let counter = 0;
        const created = selectionConstraints({ type, targets, value }, () => `control-constraint-${Date.now()}-${++counter}`);
        sketch.applyCanvasEdit(sketch.entities.value, [...sketch.constraints.value, ...created]);
        selection.clear();
        await sketch.solve();
        return { constraintIds: created.map((c) => c.id), residual: sketch.solveResidual.value, entities: sketch.entities.value };
      },
    }),
  ];
}
