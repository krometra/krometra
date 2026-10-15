import { nextTick } from "vue";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { extrudeCaps } from "@/lib/control/extrudeCaps";
import { param } from "@/lib/control/params";
import { describeBodyTopology } from "@/lib/control/topology";
import { browserPlaneFrame } from "@/lib/browserExtrudeFrame";
import { browserExtrudeSpan, type BrowserExtrudeDirection } from "@/lib/browserExtrudeExtent";
import type { PlaneBasis, SketchPlane } from "@/types/api";
import { fail } from "@/lib/control/protocol";
import type { EditorControlContext } from "./controlContext";
import { applyControlFeature, FEATURE_RESULT, requireVisibleBody } from "./controlFeatureResult";

const THREAD_FACE_TIMEOUT_MS = 30_000;

const EXACT_EDGES =
  "В операцию уходят ровно перечисленные рёбра: касательная цепочка интерфейса их не расширяет.";

export function featureOps(context: EditorControlContext): ControlOp[] {
  const { extrude, filletChamfer, booleanMode, thread } = context;

  function applyFeature(run: () => Promise<void>, readError: () => string | null, leave: () => void) {
    return applyControlFeature(context, run, readError, leave);
  }

  function selectEdges(kind: "fillet" | "chamfer", bodyId: string, edgeIds: string[]) {
    requireVisibleBody(context, bodyId);
    context.leaveTools();
    filletChamfer.enter(kind);
    const viewport = context.viewport();
    const missing = edgeIds.filter((edgeId) => !viewport.selectEdge(bodyId, edgeId));
    if (missing.length > 0) {
      filletChamfer.exit();
      throw fail("not_found", `У тела «${bodyId}» нет рёбер: ${missing.join(", ")}. Список рёбер — op "topology".`);
    }
    return filletChamfer.edgeIds.value;
  }

  function capsOf(feature: { bodyId: string | null; sketchId: string | null; params: Record<string, unknown> }) {
    const { params } = feature;
    const sketch = context.model.sketches.value.find((candidate) => candidate.id === feature.sketchId);
    if (!feature.bodyId || !sketch || (params.extent_type ?? "distance") !== "distance" || typeof params.distance !== "number") return null;
    const frame = browserPlaneFrame({
      plane: (sketch.plane as SketchPlane) ?? "XY",
      planeOffset: typeof sketch.plane_offset === "number" ? sketch.plane_offset : 0,
      planeBasis: (sketch.plane_basis as PlaneBasis | null) ?? null,
      center: { x: 0, y: 0 },
    });
    const span = browserExtrudeSpan(
      {
        extentType: "distance",
        direction: (params.direction as BrowserExtrudeDirection) ?? "one_side",
        distance: params.distance,
        backDistance: typeof params.back_distance === "number" ? params.back_distance : 0,
        offset: 0,
        operation: "new_body",
      },
      null,
    );
    return extrudeCaps(describeBodyTopology(feature.bodyId, context.bodyMesh(feature.bodyId)).faces, frame, span);
  }

  async function waitThreadFace() {
    try {
      await context.waitFor(
        () => thread.cylinder.value !== null || thread.faceHint.value !== null,
        THREAD_FACE_TIMEOUT_MS,
        "Ядро не разобрало грань за отведённое время.",
      );
    } catch (error) {
      thread.exit();
      throw error;
    }
    if (thread.cylinder.value) return;
    const reason = thread.faceHint.value ?? "На этой грани резьба не строится.";
    thread.exit();
    throw fail("operation_failed", reason);
  }

  return [
    defineOp({
      op: "extrude",
      description: `Выдавливает замкнутый профиль сохранённого эскиза — панель «Выдавить». ${FEATURE_RESULT} Для extent = distance в ответе ещё { capFaceIds, baseFaceIds }: плоские грани тела-результата на дальнем торце (торцах) выдавливания и в плоскости эскиза — на них сразу ставят следующий эскиз (sketch.create { bodyId, faceId }) без op topology; для остальных extent — null. В params записи distance хранится со знаком вдоль нормали эскиза (см. op state).`,
      mutates: true,
      params: {
        sketchId: param.id("Эскиз из op state или результат sketch.create / sketch.finish."),
        distance: param.optional(param.number("Расстояние в мм (модуль). Обязательно при extent = distance.", { above: 0 })),
        operation: param.optional(
          param.oneOf(["new_body", "join", "cut"], "new_body — новое тело (по умолчанию), join — приклеить к телу, cut — вырезать из тела."),
        ),
        targetBodyId: param.optional(
          param.id("Тело для join и cut. У эскиза на грани цель — тело этой грани, иначе по умолчанию берётся первое тело документа."),
        ),
        direction: param.optional(
          param.oneOf(
            ["one_side", "symmetric", "two_sided"],
            "one_side — в одну сторону (по умолчанию), symmetric — поровну в обе, two_sided — distance вперёд и backDistance назад.",
          ),
        ),
        backDistance: param.optional(param.number("Обратное расстояние в мм для direction = two_sided.", { above: 0 })),
        reversed: param.optional(
          param.boolean("Перевернуть сторону. Без него new_body и join идут по нормали эскиза, cut — против неё, внутрь тела."),
        ),
        extent: param.optional(
          param.oneOf(
            ["distance", "through_all", "up_to_face", "up_to_body"],
            "Предел: distance — на расстояние (по умолчанию), through_all — насквозь, up_to_face — до грани (upToBodyId + upToFaceId), up_to_body — до тела (upToBodyId).",
          ),
        ),
        upToBodyId: param.optional(param.id("Тело-предел для extent = up_to_body или тело грани-предела для up_to_face.")),
        upToFaceId: param.optional(param.id("Грань-предел для extent = up_to_face (id из op topology).")),
        offset: param.optional(param.number("Отступ от предела в мм для up_to_face и up_to_body.")),
      },
      run: async (params) => {
        const extentType = params.extent ?? "distance";
        if (extentType === "distance" && params.distance === undefined) {
          throw fail("invalid_params", "Не задан параметр «distance»: он обязателен при extent = distance.");
        }
        if (extentType === "up_to_face" && (params.upToBodyId === undefined || params.upToFaceId === undefined)) {
          throw fail("invalid_params", "Для extent = up_to_face задайте upToBodyId и upToFaceId.");
        }
        if (extentType === "up_to_body" && params.upToBodyId === undefined) {
          throw fail("invalid_params", "Для extent = up_to_body задайте upToBodyId.");
        }
        context.requireSketch(params.sketchId);
        if (params.targetBodyId !== undefined) context.bodyMesh(params.targetBodyId);
        const upToFace =
          extentType === "up_to_face" && params.upToBodyId !== undefined && params.upToFaceId !== undefined
            ? { bodyId: params.upToBodyId, faceId: context.bodyFace(params.upToBodyId, params.upToFaceId).faceId }
            : null;
        if (extentType === "up_to_body" && params.upToBodyId !== undefined) context.bodyMesh(params.upToBodyId);

        context.leaveTools();
        extrude.startExtrudeFromSketch(params.sketchId, "extrude");
        extrude.configureExtrude({
          distance: params.distance,
          operation: params.operation,
          targetBodyId: params.targetBodyId,
          direction: params.direction,
          backDistance: params.backDistance,
          reversed: params.reversed,
          extentType,
          upToBodyId: extentType === "up_to_body" ? params.upToBodyId : undefined,
          upToFace,
          offset: params.offset,
        });
        await nextTick();
        const applied = await applyFeature(extrude.handleExtrude, () => extrude.extrudeError.value, extrude.clearSketchContext);
        return { ...applied, ...(capsOf(applied.feature) ?? { capFaceIds: null, baseFaceIds: null }) };
      },
    }),

    defineOp({
      op: "revolve",
      description: `Вращает замкнутый профиль сохранённого эскиза вокруг оси в плоскости эскиза — панель «Вращать». Результат — новое тело. ${FEATURE_RESULT}`,
      mutates: true,
      params: {
        sketchId: param.id("Эскиз из op state или результат sketch.create / sketch.finish."),
        angle: param.optional(param.number("Угол в градусах, по умолчанию 360.", { above: 0, max: 360 })),
        axis: param.optional(param.oneOf(["x", "y"], "Ось вращения в координатах эскиза, по умолчанию y.")),
        axisOrigin: param.optional(param.vec2("Точка [x, y] в координатах эскиза, через которую проходит ось. По умолчанию [0, 0].")),
        direction: param.optional(param.oneOf(["one_side", "symmetric"], "one_side (по умолчанию) или symmetric — поровну в обе стороны.")),
      },
      run: async ({ sketchId, angle, axis, axisOrigin, direction }) => {
        context.requireSketch(sketchId);
        context.leaveTools();
        extrude.startExtrudeFromSketch(sketchId, "revolve");
        extrude.configureRevolve({
          angle,
          axis,
          axisOrigin: { x: axisOrigin?.[0] ?? 0, y: axisOrigin?.[1] ?? 0 },
          direction,
        });
        return applyFeature(extrude.handleRevolve, () => extrude.revolveError.value, extrude.clearSketchContext);
      },
    }),

    defineOp({
      op: "fillet",
      description: `Скругляет рёбра одного тела — панель «Скругление». ${FEATURE_RESULT}`,
      mutates: true,
      params: {
        bodyId: param.id("Видимое тело из op state."),
        edgeIds: param.list(param.id("Идентификатор ребра."), `Рёбра тела из op topology: [id, …]. ${EXACT_EDGES}`),
        radius: param.number("Радиус скругления в мм.", { above: 0 }),
      },
      run: async ({ bodyId, edgeIds, radius }) => {
        const selected = selectEdges("fillet", bodyId, edgeIds);
        return applyFeature(
          () => filletChamfer.applyFillet({ edgeIds: selected, radius }),
          () => filletChamfer.error.value,
          filletChamfer.exit,
        );
      },
    }),

    defineOp({
      op: "chamfer",
      description: `Снимает фаску на рёбрах одного тела — панель «Фаска». ${FEATURE_RESULT}`,
      mutates: true,
      params: {
        bodyId: param.id("Видимое тело из op state."),
        edgeIds: param.list(param.id("Идентификатор ребра."), `Рёбра тела из op topology: [id, …]. ${EXACT_EDGES}`),
        distance: param.number("Катет фаски в мм.", { above: 0 }),
        distance2: param.optional(param.number("Второй катет в мм для несимметричной фаски. По умолчанию равен distance.", { above: 0 })),
      },
      run: async ({ bodyId, edgeIds, distance, distance2 }) => {
        const selected = selectEdges("chamfer", bodyId, edgeIds);
        return applyFeature(
          () => filletChamfer.applyChamfer({ edgeIds: selected, distance1: distance, distance2: distance2 ?? distance }),
          () => filletChamfer.error.value,
          filletChamfer.exit,
        );
      },
    }),

    defineOp({
      op: "boolean",
      description: `Булева операция над двумя телами — панель «Boolean». Исходные тела скрываются, результат — новое тело. ${FEATURE_RESULT}`,
      mutates: true,
      params: {
        operation: param.oneOf(["union", "subtract", "intersect"], "union — объединить, subtract — вычесть tool из target, intersect — оставить пересечение."),
        targetBodyId: param.id("Тело-цель из op state."),
        toolBodyId: param.id("Тело-инструмент из op state."),
      },
      run: async ({ operation, targetBodyId, toolBodyId }) => {
        if (targetBodyId === toolBodyId) throw fail("invalid_params", "Цель и инструмент должны быть разными телами.");
        context.bodyMesh(targetBodyId);
        context.bodyMesh(toolBodyId);
        context.leaveTools();
        booleanMode.enter();
        booleanMode.setOperation(operation);
        booleanMode.selectTarget(targetBodyId);
        booleanMode.selectTool(toolBodyId);
        return applyFeature(booleanMode.apply, () => booleanMode.error.value, booleanMode.exit);
      },
    }),

    defineOp({
      op: "thread",
      description: `Нарезает резьбу на цилиндрической грани — панель «Резьба». Внешняя (стержень) или внутренняя (отверстие) определяется ориентацией грани, вручную не задаётся. ${FEATURE_RESULT}`,
      mutates: true,
      params: {
        bodyId: param.id("Тело из op state."),
        faceId: param.id("Цилиндрическая грань тела из op topology."),
        pitch: param.number("Шаг резьбы в мм.", { above: 0 }),
        depth: param.optional(param.number("Глубина профиля в мм. По умолчанию — метрическая по ISO для заданного шага.", { above: 0 })),
        length: param.optional(param.number("Длина резьбы в мм. По умолчанию — на всю грань.", { above: 0 })),
        offset: param.optional(param.number("Отступ начала резьбы от края грани в мм, по умолчанию 0.", { min: 0 })),
        crestRatio: param.optional(
          param.number("Ширина плоской вершины профиля в долях шага, от 0 до 1 не включая: 0 — острый треугольник (по умолчанию), 0.35 — трапеция, 0.55 и больше — широкий паз.", { min: 0 }),
        ),
        starts: param.optional(param.integer("Число заходов, по умолчанию 1.", { min: 1 })),
        leftHanded: param.optional(param.boolean("Левая резьба. По умолчанию false — правая.")),
      },
      run: async ({ bodyId, faceId, pitch, depth, length, offset, crestRatio, starts, leftHanded }) => {
        const face = context.bodyFace(bodyId, faceId);
        context.leaveTools();
        thread.enter();
        thread.onFaceSelected({ bodyId, faceId: face.faceId, brepTopo: face.mesh.brep_topo });
        await waitThreadFace();
        return applyFeature(
          () =>
            thread.apply({
              pitch,
              depth: depth ?? null,
              length: length ?? null,
              offset: offset ?? 0,
              crestRatio: crestRatio ?? 0,
              starts: starts ?? 1,
              rightHanded: leftHanded !== true,
            }),
          () => thread.error.value,
          thread.exit,
        );
      },
    }),
  ];
}
