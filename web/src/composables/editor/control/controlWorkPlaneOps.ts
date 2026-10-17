import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { INVALID, param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { POINT_INPUT_FORMAT, readPointInput, requestedWorkPlane, type PointInput, type WorkPlaneParams } from "@/lib/control/workPlaneRequest";
import { WORK_PLANE_BASES, WorkPlaneError } from "@/lib/workPlane";
import { sketchesOnPlane, type WorkPlaneEntry } from "@/lib/workPlaneDocument";
import { vertexRefAt } from "@/lib/workPlaneMesh";
import type { EditorControlContext } from "./controlContext";

const definitionParams = {
  kind: param.oneOf(["offset", "angle", "three_points", "midplane"] as const, "Тип плоскости: offset — смещённая, angle — под углом через ось, three_points — по трём точкам, midplane — посередине между двумя параллельными гранями."),
  bodyId: param.optional(param.id("Тело, которому принадлежат faceId, edgeId, faceIds и вершины points.")),
  plane: param.optional(param.oneOf(WORK_PLANE_BASES, "Опорная базовая плоскость для offset и angle. По умолчанию XY.")),
  faceId: param.optional(param.id("Опорная плоская грань тела bodyId для offset и angle — вместо plane.")),
  referenceSketchId: param.optional(param.id("Опора — плоскость эскиза для offset и angle — вместо plane.")),
  distance: param.optional(param.number("Смещение offset в мм вдоль нормали опоры; знак задаёт сторону. По умолчанию 0.")),
  edgeId: param.optional(param.id("Ось angle — прямое ребро тела bodyId.")),
  lineSketchId: param.optional(param.id("Ось angle — эскиз с отрезком lineId (вместо edgeId).")),
  lineId: param.optional(param.id("Ось angle — отрезок эскиза lineSketchId.")),
  angle: param.optional(param.number("Угол angle в градусах от опорной плоскости: 0 — параллельно, 90 — перпендикулярно. По умолчанию 90.", { min: -360, max: 360 })),
  points: param.optional(param.list(param.object("Точка.", POINT_INPUT_FORMAT, (value) => readPointInput(value) as PointInput | typeof INVALID), `Три точки three_points, элемент — ${POINT_INPUT_FORMAT}.`, 3)),
  faceIds: param.optional(param.list(param.id("Грань."), "Две параллельные плоские грани тела bodyId для midplane.", 2)),
};

const PLANE_RESULT = "{ id, name, kind, definition, visible, refBodyId, plane, planeOffset, planeBasis { origin, u, v, n }, sketchIds }";

export function workPlaneOps(context: EditorControlContext): ControlOp[] {
  const { workPlanes } = context;

  function snapshot(plane: WorkPlaneEntry) {
    const components = context.documentStore.document.value?.components ?? {};
    return {
      id: plane.id,
      name: workPlanes.label(plane.id),
      kind: plane.definition.kind,
      definition: plane.definition,
      visible: plane.visible !== false,
      refBodyId: plane.ref_body_id,
      plane: plane.plane,
      planeOffset: plane.plane_offset,
      planeBasis: plane.plane_basis,
      sketchIds: sketchesOnPlane(components, plane.id),
    };
  }

  function planeById(planeId: string): WorkPlaneEntry {
    const plane = workPlanes.planes.value.find((candidate) => candidate.id === planeId);
    if (!plane) throw fail("not_found", `Рабочей плоскости «${planeId}» нет. Список — op "plane.list".`);
    return plane;
  }

  function definitionOf(params: WorkPlaneParams) {
    return requestedWorkPlane(params, (bodyId, point) => vertexRefAt(context.bodyMesh(bodyId), bodyId, point));
  }

  async function guarded<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof WorkPlaneError) throw fail("operation_failed", error.message);
      throw error;
    }
  }

  return [
    defineOp({
      op: "plane.list",
      description: `Рабочие плоскости документа и призрак открытой панели «Плоскость». Возвращает { planes: [${PLANE_RESULT}], shown, preview }: shown — id плоскостей, видимых в сцене, preview — { origin, normal } призрака до применения либо null. Эскиз на плоскости — sketch.create { planeId }.`,
      run: () => ({
        planes: workPlanes.planes.value.map(snapshot),
        ...(context.viewportRef.value?.workPlaneScene() ?? { planeIds: [], preview: null }),
      }),
    }),

    defineOp({
      op: "plane.create",
      description: `Создаёт рабочую плоскость — то же, что панель «Плоскость». offset: опора plane | faceId | referenceSketchId и distance. angle: ось edgeId или lineSketchId + lineId, опора (от неё отсчитывается угол) и angle. three_points: points. midplane: bodyId и faceIds. Плоскость, опирающаяся на тело, пересчитывается при пересборке этого тела. Отменяется history.undo. Возвращает ${PLANE_RESULT}.`,
      mutates: true,
      params: definitionParams,
      run: (params) => guarded(async () => {
        context.leaveTools();
        const planeId = await workPlanes.create(definitionOf(params));
        return snapshot(planeById(planeId));
      }),
    }),

    defineOp({
      op: "plane.update",
      description: `Меняет определение рабочей плоскости planeId (те же параметры, что plane.create). Эскизы на плоскости переезжают, операции от них пересобираются; не построившиеся остаются в истории с ошибкой. Отменяется одним history.undo. Возвращает ${PLANE_RESULT}.`,
      mutates: true,
      params: { planeId: param.id("Рабочая плоскость из op plane.list."), ...definitionParams },
      run: ({ planeId, ...params }) => guarded(async () => {
        planeById(planeId);
        context.leaveTools();
        await workPlanes.update(planeId, definitionOf(params));
        return snapshot(planeById(planeId));
      }),
    }),

    defineOp({
      op: "plane.delete",
      description: "Удаляет рабочую плоскость planeId без вопросов. Эскизы на ней остаются на месте, но перестают следовать за плоскостью. Отменяется history.undo. Возвращает { deleted, detachedSketchIds }.",
      mutates: true,
      params: { planeId: param.id("Рабочая плоскость из op plane.list.") },
      run: async ({ planeId }) => {
        planeById(planeId);
        const detached = sketchesOnPlane(context.documentStore.document.value?.components ?? {}, planeId);
        context.leaveTools();
        await workPlanes.remove(planeId);
        if (workPlanes.planes.value.some((plane) => plane.id === planeId)) throw fail("operation_failed", "Плоскость не удалилась.");
        return { deleted: planeId, detachedSketchIds: detached };
      },
    }),
  ];
}
