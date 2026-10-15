import { MAX_PATTERN_INSTANCES, MAX_SEPARATE_PATTERN_INSTANCES, patternError, patternReferenceBodies, type PatternSpec } from "@/lib/bodyPattern";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { patternAxisParam } from "@/lib/control/patternParams";
import { fail } from "@/lib/control/protocol";
import { bodyLineage } from "./controlBodyOps";
import type { EditorControlContext } from "./controlContext";

const DESCRIPTION = [
  "Массив тела — копии исходного тела одной операцией истории (kind = pattern в timeline).",
  "type = linear: копии через шаг spacing вдоль axis, со вторым направлением axis2/count2/spacing2 — сетка (2×2 — четыре ножки или отверстия одной операцией).",
  "type = circular: копии вокруг оси axis; angle = 360 — равномерно по окружности, меньше — крайние копии на концах дуги.",
  "Ось: глобальная X/Y/Z через начало координат, прямое ребро (направление ребра), грань (цилиндрическая — её ось, плоская — нормаль через центр) или произвольная прямая.",
  "По умолчанию копии объединяются с исходным телом в одно тело (исходное поглощается и скрывается, как у join; непересекающиеся копии остаются отдельными солидами внутри тела).",
  "С separate = true исходное тело остаётся, каждая копия — своё тело.",
  "Вырез массивом: постройте одно тело-инструмент, размножьте его (separate = false) и вычтите результат op boolean subtract.",
  `Не больше ${MAX_PATTERN_INSTANCES} экземпляров, отдельными телами — ${MAX_SEPARATE_PATTERN_INSTANCES}.`,
  "Отменяется history.undo. Возвращает { bodyIds, feature, mode }: bodyIds — тела-результаты.",
].join(" ");

export function patternOps(context: EditorControlContext): ControlOp[] {
  return [
    defineOp({
      op: "body.pattern",
      description: DESCRIPTION,
      mutates: true,
      params: {
        bodyId: param.id("Видимое тело из op state, которое размножается."),
        type: param.oneOf(["linear", "circular"] as const, "Вид массива."),
        axis: patternAxisParam("Направление линейного массива или ось кругового."),
        count: param.integer("Число экземпляров вместе с исходным.", { min: 2 }),
        spacing: param.optional(param.number("Шаг линейного массива в мм; отрицательный разворачивает направление. По умолчанию 10.")),
        angle: param.optional(param.number("Полный угол кругового массива в градусах. По умолчанию 360.", { above: 0, max: 360 })),
        axis2: param.optional(patternAxisParam("Второе направление линейного массива (сетка).")),
        count2: param.optional(param.integer("Число рядов во втором направлении. По умолчанию 1.", { min: 1 })),
        spacing2: param.optional(param.number("Шаг во втором направлении в мм. По умолчанию 10.")),
        separate: param.optional(param.boolean("true — каждая копия отдельным телом, исходное остаётся. По умолчанию false.")),
      },
      run: async ({ bodyId, type, axis, count, spacing, angle, axis2, count2, spacing2, separate }) => {
        context.bodyMesh(bodyId);
        if (bodyLineage(context)(bodyId).consumedBy !== null) {
          throw fail("operation_failed", `Тело «${bodyId}» уже поглощено операцией: размножайте его результат (replacedBy в op state).`);
        }
        const spec: PatternSpec = type === "circular"
          ? { type, axis, count, angle: angle ?? 360 }
          : { type, axis, count, spacing: spacing ?? 10, axis2: axis2 ?? null, count2: count2 ?? 1, spacing2: spacing2 ?? 10 };
        const mode = separate ? "separate" : "join";
        const invalid = patternError(spec, mode);
        if (invalid) throw fail("invalid_params", invalid);
        patternReferenceBodies(spec).forEach((reference) => context.bodyMesh(reference));
        context.leaveTools();
        const known = new Set(context.model.timelineEntries.value.map((entry) => entry.id));
        const bodyIds = await context.pattern.run(bodyId, spec, mode);
        const feature = context.model.timelineEntries.value.find((entry) => !known.has(entry.id));
        return { bodyIds, feature: feature ? context.timelineEntry(feature) : null, mode: context.mode() };
      },
    }),
  ];
}
