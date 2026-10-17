import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { filterTopology, findFaces } from "@/lib/control/faceSearch";
import { describeBodyTopology, meshStats } from "@/lib/control/topology";
import { bodyLineage } from "./controlBodyOps";
import type { EditorControlContext } from "./controlContext";

export function readOps(context: EditorControlContext, busyReason: () => string | null): ControlOp[] {
  function selectionSnapshot() {
    const current = context.selection.selection.value;
    if (!current) return null;
    if (current.type === "face") return { type: current.type, bodyId: current.bodyId, faceId: String(current.faceId) };
    if (current.type === "edge") return { type: current.type, bodyId: current.bodyId, edgeId: String(current.edgeId) };
    return { type: current.type, bodyId: current.bodyId, vertexId: String(current.vertexId) };
  }

  function bodies(allBodies: boolean) {
    const lineage = bodyLineage(context);
    const described = context.model.bodies.value.map((body) => ({
      id: body.id,
      name: context.names.bodyLabel(body.id),
      visible: body.visible !== false,
      color: typeof body.color === "string" ? body.color : null,
      ...lineage(body.id),
    }));
    return allBodies ? described : described.filter((body) => body.consumedBy === null);
  }

  function edgeRef(edge: { bodyId: string; edgeId: string | number }) {
    return { bodyId: edge.bodyId, edgeId: String(edge.edgeId) };
  }

  return [
    defineOp({
      op: "state",
      description:
        "Состояние редактора одним снимком; доступно сразу после монтирования, ещё до готовности. Возвращает { projectId, mode, ready, kernel, kernelError, legacyProject, document: { version, dirty }, bodies: [{ id, name, visible, color, consumedBy, replacedBy }], consumedBodyCount, sketches: [{ id, name, plane, planeOffset, used, visible }], timeline: [{ id, kind, label, name, status, params, sketchId, bodyId }], busy }. bodies по умолчанию — только «живые» тела; join, cut, скругление, фаска, резьба, оболочка, уклон, булева операция, перемещение без копии и зеркало с объединением поглощают исходное тело: оно скрывается, а результат получает новый id. У поглощённого тела consumedBy — id записи истории, replacedBy — тело-результат; такие тела показываются с allBodies = true, их число — consumedBodyCount. Цепочку замен проходят по replacedBy до тела с consumedBy = null. У extrude params.distance хранится со знаком вдоль нормали эскиза: плюс — по нормали, минус — против; new_body и join без reversed дают плюс, cut без reversed — минус. Чтобы повторить операцию по params, передайте distance = |distance| и reversed = (operation = cut ? distance > 0 : distance < 0). mode: model | sketch | plane_pick | extrude | revolve | fillet | chamfer | thread | shell | draft | mirror | hole | boolean | sweep | measure. kernel — фаза браузерного ядра: idle | loading | ready | restarting | failed. busy = true, пока идёт мутирующая операция, сохранение или перезагрузка тел. bodyId записи истории — тело-результат операции.",
      needsReady: false,
      params: {
        allBodies: param.optional(param.boolean("Включить в bodies поглощённые тела (промежуточные тела цепочек). По умолчанию false.")),
      },
      run: ({ allBodies }) => ({
        projectId: context.projectId,
        mode: context.mode(),
        ready: context.notReadyReason() === null,
        kernel: context.kernel.phase.value,
        kernelError: context.kernel.failure.value,
        legacyProject: context.meshes.legacyProject.value,
        document: { version: context.documentStore.version.value, dirty: context.documentStore.isDirty.value },
        bodies: bodies(allBodies === true),
        consumedBodyCount: bodies(true).filter((body) => body.consumedBy !== null).length,
        sketches: context.model.sketches.value.map((sketch) => ({
          id: sketch.id,
          name: context.names.sketchLabel(sketch.id),
          plane: sketch.plane ?? null,
          planeOffset: typeof sketch.plane_offset === "number" ? sketch.plane_offset : 0,
          used: context.model.sketchHasFeature(sketch.id),
          visible: sketch.visible !== false,
        })),
        timeline: context.model.timelineEntries.value.map(context.timelineEntry),
        busy: busyReason() !== null,
      }),
    }),

    defineOp({
      op: "topology",
      description:
        "Грани и рёбра тела со стабильными идентификаторами и геометрией по тесселяции (мм). Возвращает { bodyId, bbox: { min, max }, faces: [{ id, edgeIds, triangles, area, planar, normal, centroid, point, bbox }], edges: [{ id, start, end, midpoint, length, closed, polyline? }] }. point — точка на самой грани (годится для клика и выбора), normal задана только у плоских граней, у замкнутой кромки start совпадает с end. Идентификаторы граней и рёбер подходят для sketch.start, thread, shell, draft, fillet, chamfer. У большого тела ответ длинный: фильтры include, planar и normal сокращают его, а одну грань по точке или нормали быстрее найти через face.find. Id грани стабилен между операциями; если операция разрезала грань на части, одна часть сохраняет прежний id, остальные получают его же с суффиксом ~1, ~2 и т. д.",
      params: {
        bodyId: param.id("Идентификатор тела из op state."),
        polylines: param.optional(param.boolean("Добавить каждому ребру полную ломаную polyline: [[x,y,z], …]. По умолчанию false.")),
        include: param.optional(param.oneOf(["all", "faces", "edges"], "Что вернуть: all (по умолчанию) — грани и рёбра, faces — только грани, edges — только рёбра.")),
        planar: param.optional(param.boolean("Только плоские (true) или только неплоские (false) грани.")),
        normal: param.optional(param.vec3("Только плоские грани с этой внешней нормалью [x, y, z] (длина не важна), например [0, 0, 1] — грани, смотрящие вверх.")),
      },
      run: ({ bodyId, polylines, include, planar, normal }) =>
        filterTopology(describeBodyTopology(bodyId, context.bodyMesh(bodyId), { polylines }), { include, planar, normal }),
    }),

    defineOp({
      op: "face.find",
      description:
        "Находит грань тела по точке и/или нормали без чтения всей топологии. Возвращает { bodyId, faces: [{ id, triangles, area, planar, normal, centroid, point, bbox, distance }] }: с point — по возрастанию расстояния от точки до грани (distance, мм), без point — по убыванию площади. Пример: верхняя плоская грань на высоте 4 мм — { normal: [0, 0, 1], point: [x, y, 4] }.",
      params: {
        bodyId: param.id("Идентификатор тела из op state."),
        point: param.optional(param.vec3("Точка [x, y, z] на грани или рядом с ней, мм.")),
        normal: param.optional(param.vec3("Внешняя нормаль плоской грани [x, y, z].")),
        planar: param.optional(param.boolean("Только плоские (true) или только неплоские (false) грани.")),
        limit: param.optional(param.integer("Сколько граней вернуть, по умолчанию 5.", { min: 1, max: 100 })),
      },
      run: ({ bodyId, point, normal, planar, limit }) => {
        const mesh = context.bodyMesh(bodyId);
        const topology = describeBodyTopology(bodyId, mesh);
        return { bodyId, faces: findFaces(topology, mesh, { point, normal, planar, limit: limit ?? 5 }) };
      },
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
        "Что реально находится в 3D-сцене (обход сцены, а не документ). Возвращает { visibleBodyIds, visibleBodyCount, sketchOutlineIds, threadPreview, mirrorPreview, section }. sketchOutlineIds — эскизы, контуры которых сейчас видны (скрытый эскиз и спрятанные контуры сюда не попадают). threadPreview — призрак резьбы до применения: { starts, pitch, depth, external, threads, bbox: { min, max } } либо null. mirrorPreview — призрак зеркального отражения в панели «Зеркало»: { sourceBodyId, bbox: { min, max } } либо null. section — секущая плоскость режима «Сечение» вьюпорта { normal, constant } (остаются точки, где normal·p + constant >= 0) либо null.",
      run: () => {
        const scene = context.viewport().inspectScene();
        if (!scene) return { visibleBodyIds: [], visibleBodyCount: 0, sketchOutlineIds: [], threadPreview: null, mirrorPreview: null, section: null };
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
