import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { measureTarget } from "@/lib/control/measureRefs";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import type { MeasuredItem, MeasureRef } from "@/lib/measure";
import { DEFAULT_MATERIAL, itemTitle, massGrams } from "@/lib/measureFormat";
import { MAX_PICKS } from "@/lib/measurePick";
import type { EditorControlContext } from "./controlContext";

export function measureOps(context: EditorControlContext): ControlOp[] {
  function checkTarget(target: MeasureRef) {
    const mesh = context.bodyMesh(target.bodyId);
    if (target.kind === "face") context.bodyFace(target.bodyId, target.faceId);
    if (target.kind === "edge" && !mesh.brep_topo.edges.some((edge) => String(edge.edge_id) === target.edgeId)) {
      throw fail("not_found", `У тела «${target.bodyId}» нет ребра «${target.edgeId}». Список рёбер — op "topology".`);
    }
  }

  function describeItem(item: MeasuredItem, target: MeasureRef, density: number) {
    const described = { bodyId: target.bodyId, title: itemTitle(item), ...item };
    return item.kind === "body" ? { ...described, mass: massGrams(item.volume, density) } : described;
  }

  return [
    defineOp({
      op: "measure",
      description:
        "Измерение по точной B-rep геометрии ядра, модель и историю не меняет. Один объект — его свойства, два — ещё и связь между ними. Возвращает { density, items: [{ bodyId, title, kind, … }], pair }. Вершина: point. Ребро: length, curve (line | circle | other), start, end, closed, direction у отрезка, radius, center и axis: { origin, direction } у окружности и дуги. Грань: area, surface (plane | cylinder | cone | sphere | torus | other), centroid, normal у плоской, radius и axis у цилиндрической, radius и center у сферической. Тело: volume (мм³), area (мм²), centerOfMass, bbox: { min, max }, mass (г) при плотности density. pair — { distance: минимальное расстояние, points: две ближайшие точки, delta: [dx, dy, dz], angle: острый угол в градусах между плоскими гранями, прямыми рёбрами и осями цилиндров (иначе null), axisDistance: межосевое расстояние параллельных цилиндров и окружностей, centerDistance: между центрами окружностей, сфер и вершин } либо null. Единицы — мм.",
      params: {
        targets: param.list(
          measureTarget("{ bodyId } — тело целиком, { bodyId, faceId } — грань, { bodyId, edgeId } — ребро, { bodyId, point: [x, y, z] } — точка, прилипает к вершине тела ближе 0.01 мм. Id — из op topology или face.find."),
          "Один или два объекта для измерения.",
        ),
        density: param.optional(param.number("Плотность материала для массы тела, г/см³. По умолчанию 7.85 (сталь).", { above: 0 })),
      },
      run: async ({ targets, density }) => {
        if (targets.length > MAX_PICKS) throw fail("invalid_params", "Измерить можно один или два объекта за раз.");
        targets.forEach(checkTarget);
        const materialDensity = density ?? DEFAULT_MATERIAL.density;
        const { measureBrowserShapes } = await import("../browserMeasure");
        const result = await measureBrowserShapes(targets);
        return {
          density: materialDensity,
          items: result.items.map((item, index) => describeItem(item, targets[index], materialDensity)),
          pair: result.pair,
        };
      },
    }),
  ];
}
