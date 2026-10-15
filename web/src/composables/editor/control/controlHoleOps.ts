import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { HOLE_BOTTOMS, HOLE_EXTENTS, HOLE_TYPES, DEFAULT_HOLE_SPEC } from "@/lib/holeGeometry";
import type { EditorControlContext } from "./controlContext";
import { applyControlFeature } from "./controlFeatureResult";

const HOLE_DESCRIPTION =
  "Сверлит отверстия на плоской грани тела — панель «Отверстие». Ось — нормаль грани внутрь материала. Центры задаются точками centers (проецируются на плоскость грани и должны лежать на ней) либо окружностями эскиза sketchId — тогда отверстие пересобирается при правке эскиза. Возвращает { feature, mode }: feature — новая запись истории (kind = hole), feature.bodyId — тело-результат, исходное тело скрывается. Стенка каждого отверстия — цилиндрическая грань, на неё можно навесить op thread. Отказ ядра — operation_failed с объяснением, модель не меняется.";

export function holeOps(context: EditorControlContext): ControlOp[] {
  const { hole } = context;

  return [
    defineOp({
      op: "hole",
      description: HOLE_DESCRIPTION,
      mutates: true,
      params: {
        bodyId: param.id("Видимое тело из op state."),
        faceId: param.id("Плоская грань тела из op topology или face.find."),
        centers: param.optional(param.list(param.vec3("Центр [x, y, z] в мм."), "Центры отверстий в мировых координатах. Обязательны без sketchId.")),
        sketchId: param.optional(param.id("Эскиз, окружности которого задают центры отверстий (вместо centers).")),
        type: param.optional(param.oneOf(HOLE_TYPES, "simple — простое (по умолчанию), counterbore — с цековкой, countersink — с зенковкой.")),
        diameter: param.number("Диаметр отверстия в мм.", { above: 0 }),
        extent: param.optional(param.oneOf(HOLE_EXTENTS, "distance — на глубину depth (по умолчанию), through_all — насквозь через всё тело.")),
        depth: param.optional(param.number(`Глубина цилиндрической части в мм для extent = distance, по умолчанию ${DEFAULT_HOLE_SPEC.depth}.`, { above: 0 })),
        bottom: param.optional(param.oneOf(HOLE_BOTTOMS, "flat — плоское дно (по умолчанию), cone — конус сверла 118° сверх depth.")),
        cboreDiameter: param.optional(param.number("Диаметр цековки в мм, больше diameter.", { above: 0 })),
        cboreDepth: param.optional(param.number("Глубина цековки в мм.", { above: 0 })),
        csinkDiameter: param.optional(param.number("Диаметр зенковки на грани в мм, больше diameter.", { above: 0 })),
        csinkAngle: param.optional(param.number("Полный угол конуса зенковки в градусах, по умолчанию 90.", { above: 0, max: 179 })),
      },
      run: async (params) => {
        if (!params.centers && !params.sketchId) throw fail("invalid_params", "Задайте centers или sketchId.");
        if (params.sketchId) context.requireSketch(params.sketchId);
        const face = context.bodyFace(params.bodyId, params.faceId);
        context.leaveTools();
        hole.enter();
        hole.setSketch(params.sketchId ?? null);
        hole.selectFace({ bodyId: params.bodyId, faceId: face.faceId, brepTopo: face.mesh.brep_topo });
        (params.centers ?? []).forEach((center) => hole.addCenter(center));
        hole.updateSpec({
          type: params.type ?? DEFAULT_HOLE_SPEC.type,
          diameter: params.diameter,
          extent: params.extent ?? DEFAULT_HOLE_SPEC.extent,
          depth: params.depth ?? DEFAULT_HOLE_SPEC.depth,
          bottom: params.bottom ?? DEFAULT_HOLE_SPEC.bottom,
          cboreDiameter: params.cboreDiameter ?? DEFAULT_HOLE_SPEC.cboreDiameter,
          cboreDepth: params.cboreDepth ?? DEFAULT_HOLE_SPEC.cboreDepth,
          csinkDiameter: params.csinkDiameter ?? DEFAULT_HOLE_SPEC.csinkDiameter,
          csinkAngle: params.csinkAngle ?? DEFAULT_HOLE_SPEC.csinkAngle,
        });
        const problem = hole.faceHint.value ?? hole.specError.value ?? (hole.centers.value.length === 0 ? "Нет ни одного центра отверстия." : null);
        if (problem) {
          hole.exit();
          throw fail("operation_failed", problem);
        }
        return applyControlFeature(context, hole.apply, () => hole.error.value, hole.exit);
      },
    }),
  ];
}
