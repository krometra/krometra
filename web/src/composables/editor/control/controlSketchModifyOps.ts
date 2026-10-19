import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { filletLines, type FilletSide, type SketchEdit } from "@/sketcher/sketchFillet";
import { applyTrim, findTrimTarget } from "@/sketcher/sketchTrim";
import type { EditorControlContext } from "./controlContext";

const DEFAULT_TRIM_TOLERANCE = 1;

export function sketchModifyOps(context: EditorControlContext): ControlOp[] {
  const { sketch } = context;
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`;

  async function applied<T extends object>(edit: SketchEdit, extra: T) {
    sketch.applyCanvasEdit(edit.entities, edit.constraints);
    await sketch.solve();
    return { ...extra, residual: sketch.solveResidual.value, entities: sketch.entities.value };
  }

  function filletSide(lineId: string): FilletSide {
    const line = sketch.entities.value.find((e) => e.id === lineId);
    if (line?.type !== "line") throw fail("not_found", `В эскизе нет отрезка «${lineId}».`);
    return { lineId, keep: { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 } };
  }

  return [
    defineOp({
      op: "sketch.fillet",
      description:
        "Скругляет угол между двумя отрезками открытого эскиза дугой заданного радиуса (как инструмент «Скругление»): отрезки укорачиваются до точек касания, " +
        "дуга связана с ними совпадением и касательностью, радиус — размером. Отрезки с общей вершиной или пересекающиеся; у каждого остаётся сторона с его серединой. " +
        "Один шаг истории. Возвращает { arcId, residual, entities }.",
      mutates: true,
      params: {
        lines: param.list(param.id("id отрезка."), "Два отрезка: [id1, id2].", 2),
        radius: param.number("Радиус скругления, мм.", { above: 0 }),
      },
      run: ({ lines, radius }) => {
        context.requireSketchMode();
        if (lines.length !== 2) throw fail("invalid_params", "Нужны ровно два отрезка.");
        const sides = lines.map(filletSide) as [FilletSide, FilletSide];
        const arcId = nextId("fillet-arc");
        const result = filletLines(sketch.entities.value, sketch.constraints.value, sides, radius, {
          arcId,
          constraintId: () => nextId("control-constraint"),
        });
        if (!result.ok) throw fail("operation_failed", result.error);
        return applied(result.edit, { arcId });
      },
    }),

    defineOp({
      op: "sketch.trim",
      description:
        "Усекает кривую открытого эскиза (как инструмент «Усечь»): удаляет участок отрезка, дуги или окружности у точки at до ближайших пересечений с другими кривыми. " +
        "Без пересечений кривая удаляется целиком; участок посередине делит её на две. Новые концы привязываются к секущим. " +
        "Один шаг истории. Возвращает { entityId, removed, residual, entities }: removed — удалённый участок.",
      mutates: true,
      params: {
        at: param.vec2("Точка на удаляемом участке [x, y], мм эскиза."),
        tolerance: param.optional(param.number("Насколько далеко от кривой может быть точка, мм. По умолчанию 1.", { above: 0 })),
      },
      run: ({ at, tolerance }) => {
        context.requireSketchMode();
        const target = findTrimTarget({ x: at[0], y: at[1] }, sketch.entities.value, tolerance ?? DEFAULT_TRIM_TOLERANCE);
        if (!target) throw fail("not_found", `У точки [${at.join(", ")}] нет отрезка, дуги или окружности.`);
        const edit = applyTrim(target, sketch.entities.value, sketch.constraints.value, {
          entityId: () => nextId("trim-entity"),
          constraintId: () => nextId("control-constraint"),
        });
        return applied(edit, { entityId: target.entity.id, removed: target.piece });
      },
    }),
  ];
}
