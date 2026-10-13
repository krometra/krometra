import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { describeBodyTopology, meshStats } from "@/lib/control/topology";
import type { EditorControlContext } from "./controlContext";

export function readOps(context: EditorControlContext, busyReason: () => string | null): ControlOp[] {
  function selectionSnapshot() {
    const current = context.selection.selection.value;
    if (!current) return null;
    if (current.type === "face") return { type: current.type, bodyId: current.bodyId, faceId: String(current.faceId) };
    if (current.type === "edge") return { type: current.type, bodyId: current.bodyId, edgeId: String(current.edgeId) };
    return { type: current.type, bodyId: current.bodyId, vertexId: String(current.vertexId) };
  }

  function edgeRef(edge: { bodyId: string; edgeId: string | number }) {
    return { bodyId: edge.bodyId, edgeId: String(edge.edgeId) };
  }

  return [
    defineOp({
      op: "state",
      description:
        "Состояние редактора одним снимком; доступно сразу после монтирования, ещё до готовности. Возвращает { projectId, mode, ready, kernel, kernelError, legacyProject, document: { version, dirty }, bodies: [{ id, name, visible }], sketches: [{ id, name, plane, used }], timeline: [{ id, kind, label, name, status, params, sketchId, bodyId }], busy }. mode: model | sketch | plane_pick | extrude | revolve | fillet | chamfer | thread | boolean. kernel — фаза браузерного ядра: idle | loading | ready | restarting | failed. busy = true, пока идёт мутирующая операция, сохранение или перезагрузка тел. bodyId записи истории — тело-результат операции.",
      needsReady: false,
      run: () => ({
        projectId: context.projectId,
        mode: context.mode(),
        ready: context.notReadyReason() === null,
        kernel: context.kernel.phase.value,
        kernelError: context.kernel.failure.value,
        legacyProject: context.meshes.legacyProject.value,
        document: { version: context.documentStore.version.value, dirty: context.documentStore.isDirty.value },
        bodies: context.model.bodies.value.map((body) => ({
          id: body.id,
          name: context.names.bodyLabel(body.id),
          visible: body.visible !== false,
        })),
        sketches: context.model.sketches.value.map((sketch) => ({
          id: sketch.id,
          name: context.names.sketchLabel(sketch.id),
          plane: sketch.plane ?? null,
          used: context.model.sketchHasFeature(sketch.id),
        })),
        timeline: context.model.timelineEntries.value.map(context.timelineEntry),
        busy: busyReason() !== null,
      }),
    }),

    defineOp({
      op: "topology",
      description:
        "Грани и рёбра тела со стабильными идентификаторами и геометрией по тесселяции (мм). Возвращает { bodyId, bbox: { min, max }, faces: [{ id, edgeIds, triangles, area, planar, normal, centroid, point, bbox }], edges: [{ id, start, end, midpoint, length, closed, polyline? }] }. point — точка на самой грани (годится для клика и выбора), normal задана только у плоских граней, у замкнутой кромки start совпадает с end. Идентификаторы граней и рёбер подходят для sketch.start, thread, fillet, chamfer.",
      params: {
        bodyId: param.id("Идентификатор тела из op state."),
        polylines: param.optional(param.boolean("Добавить каждому ребру полную ломаную polyline: [[x,y,z], …]. По умолчанию false.")),
      },
      run: ({ bodyId, polylines }) => describeBodyTopology(bodyId, context.bodyMesh(bodyId), { polylines }),
    }),

    defineOp({
      op: "mesh.stats",
      description:
        "Проверка тесселяции тела. Возвращает { bodyId, bbox: { min, max }, vertices, triangles, openEdges, zLevels }. openEdges — рёбра меша, принадлежащие не ровно двум треугольникам: у целого замкнутого тела их 0. zLevels — различные высоты вершин по Z, округлённые до 0.01 мм.",
      params: { bodyId: param.id("Идентификатор тела из op state.") },
      run: ({ bodyId }) => {
        const mesh = context.bodyMesh(bodyId);
        return { bodyId, bbox: mesh.bbox, ...meshStats(mesh) };
      },
    }),

    defineOp({
      op: "scene.get",
      description:
        "Что реально находится в 3D-сцене (обход сцены, а не документ). Возвращает { visibleBodyIds, visibleBodyCount, threadPreview }. threadPreview — призрак резьбы до применения: { starts, pitch, depth, external, threads, bbox: { min, max } } либо null.",
      run: () => {
        const scene = context.viewport().inspectScene();
        if (!scene) return { visibleBodyIds: [], visibleBodyCount: 0, threadPreview: null };
        return { ...scene, visibleBodyCount: scene.visibleBodyIds.length };
      },
    }),

    defineOp({
      op: "selection.get",
      description:
        "Текущее выделение. Возвращает { selection, featureId, edges, hoveredEdge, highlightedEdges, edgeChain, booleanBodies: { targetId, toolId } }. selection — { type: face | edge | vertex, bodyId, faceId | edgeId | vertexId } либо null; featureId — выбранная запись истории; edges — рёбра, выбранные для скругления или фаски; hoveredEdge — ребро под курсором; highlightedEdges — рёбра, которые возьмёт или снимет клик в этой точке (касательная цепочка ребра либо все рёбра грани под курсором); edgeChain — включена ли касательная цепочка для кликов по рёбрам.",
      run: () => {
        const viewport = context.viewport();
        const hovered = viewport.getHoveredEdge();
        return {
          selection: selectionSnapshot(),
          featureId: context.selection.selectedFeatureId.value,
          edges: viewport.getSelectedEdges().map(edgeRef),
          hoveredEdge: hovered ? edgeRef(hovered) : null,
          highlightedEdges: viewport.getHighlightedEdges().map(edgeRef),
          edgeChain: context.filletChamfer.chain.value,
          booleanBodies: viewport.getSelectedBodyIds(),
        };
      },
    }),
  ];
}
