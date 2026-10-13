import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { assignEntityIds, sketchEntitiesParam, SKETCH_ENTITY_FORMAT, type SketchEntityInput } from "@/lib/control/sketchEntities";
import type { SketchPlane } from "@/types/api";
import type { EditorControlContext } from "./controlContext";

const CANVAS_TIMEOUT_MS = 15_000;
const PNG_PREFIX = "data:image/png;base64,";

interface SketchPlacement {
  plane?: SketchPlane;
  bodyId?: string;
  faceId?: string;
}

type SketchTarget = { kind: "plane"; plane: SketchPlane } | { kind: "face"; bodyId: string; faceId: string | number };

const placementParams = {
  plane: param.optional(param.oneOf(["XY", "XZ", "YZ"], "Базовая плоскость эскиза. Задаётся вместо bodyId и faceId.")),
  bodyId: param.optional(param.id("Тело, на плоской грани которого строится эскиз. Задаётся вместе с faceId.")),
  faceId: param.optional(param.id("Плоская грань тела из op topology (поле planar). Задаётся вместе с bodyId.")),
};

const ENTITIES_HELP = `Сущности эскиза: массив, элемент — ${SKETCH_ENTITY_FORMAT}. Замкнутый контур даёт профиль для выдавливания и вращения.`;

export function sketchOps(context: EditorControlContext): ControlOp[] {
  const { sketch, sketchFlow } = context;

  function snapshot() {
    return {
      active: sketch.sketchMode.value,
      id: sketch.activeSketchId.value,
      loaded: sketch.activeSketchId.value !== null && sketchFlow.canvasSketchId.value === sketch.activeSketchId.value,
      plane: sketch.sketchMode.value ? sketch.sketchPlane.value : null,
      planeOffset: sketch.planeOffset.value,
      planeBasis: sketch.planeBasis.value,
      refBodyId: sketch.refBodyId.value,
      refFaceId: sketch.refFaceId.value === null ? null : String(sketch.refFaceId.value),
      tool: sketch.currentTool.value,
      entities: sketch.entities.value,
      constraints: sketch.constraints.value,
      canUndo: sketch.canUndo.value,
      canRedo: sketch.canRedo.value,
    };
  }

  function canvas() {
    context.requireSketchMode();
    const view = context.sketcherRef.value?.getCanvas();
    const element = view?.getCanvasEl();
    if (!view || !element) throw fail("not_ready", "Канвас эскиза ещё не смонтирован.");
    return { view, element };
  }

  async function canvasLoaded() {
    await context.waitFor(
      () => sketch.activeSketchId.value !== null && sketchFlow.canvasSketchId.value === sketch.activeSketchId.value,
      CANVAS_TIMEOUT_MS,
      "Канвас эскиза не загрузился за отведённое время.",
    );
  }

  function pickPlacement(placement: SketchPlacement): SketchTarget {
    const onFace = placement.bodyId !== undefined || placement.faceId !== undefined;
    if (placement.plane !== undefined && onFace) {
      throw fail("invalid_params", "Задайте либо plane, либо пару bodyId и faceId, но не всё сразу.");
    }
    if (placement.plane !== undefined) return { kind: "plane", plane: placement.plane };
    if (placement.bodyId === undefined || placement.faceId === undefined) {
      throw fail("invalid_params", "Задайте plane (XY | XZ | YZ) либо bodyId вместе с faceId.");
    }
    return { kind: "face", bodyId: placement.bodyId, faceId: context.bodyFace(placement.bodyId, placement.faceId).faceId };
  }

  async function start(placement: SketchPlacement) {
    const target = pickPlacement(placement);
    context.leaveTools();
    sketchFlow.beginPlanePick();
    if (target.kind === "plane") {
      sketchFlow.onPlanePicked({ plane: target.plane });
    } else {
      sketchFlow.handleFaceSketchStart({ bodyId: target.bodyId, faceId: target.faceId });
      if (sketchFlow.facePickMode.value) {
        const reason = sketchFlow.facePickError.value ?? "Эскиз на этой грани начать не удалось.";
        sketchFlow.cancelFacePick();
        throw fail("operation_failed", reason);
      }
    }
    await canvasLoaded();
    return snapshot();
  }

  async function addEntities(inputs: SketchEntityInput[]) {
    context.requireSketchMode();
    await canvasLoaded();
    const created = assignEntityIds(inputs, sketch.entities.value.map((entity) => entity.id), Date.now());
    sketch.applyCanvasEdit([...sketch.entities.value, ...created], sketch.constraints.value);
    return { sketchId: sketch.activeSketchId.value, entityIds: created.map((entity) => entity.id), entityCount: sketch.entities.value.length };
  }

  async function finish() {
    const sketchId = context.requireSketchMode();
    const entityCount = sketch.entities.value.length;
    await sketchFlow.handleSketchOk();
    if (sketch.sketchMode.value) throw fail("operation_failed", "Не удалось сохранить эскиз: он остался открытым.");
    return { sketchId, entityCount, mode: context.mode() };
  }

  async function create(placement: SketchPlacement, entities: SketchEntityInput[]) {
    await start(placement);
    try {
      await addEntities(entities);
      return await finish();
    } catch (error) {
      if (sketch.sketchMode.value) sketchFlow.handleSketchCancel();
      throw error;
    }
  }

  return [
    defineOp({
      op: "sketch.get",
      description:
        "Открытый эскиз. Возвращает { active, id, loaded, plane, planeOffset, planeBasis, refBodyId, refFaceId, tool, entities, constraints, canUndo, canRedo }. Вне режима эскиза active = false, id = null, entities пуст. loaded = true, когда канвас загрузил эскиз и готов к вводу. Сущности: line { start, end }, rectangle { corner1, corner2 }, circle { center, radius }, arc { center, radius, startAngle, endAngle }; construction = true у линий построения (контур грани под эскизом).",
      run: snapshot,
    }),

    defineOp({
      op: "sketch.project",
      description:
        "Проецирует точки эскиза (мм, система координат эскиза) в клиентские координаты страницы на канвасе скетчера. Возвращает { points: [{ x, y }], canvas: { left, top, width, height }, pixelsPerMm }. Только в режиме эскиза.",
      params: { points: param.list(param.vec2("Точка [x, y]."), "Точки эскиза: [[x, y], …].", 0) },
      run: ({ points }) => {
        const { view, element } = canvas();
        const rect = element.getBoundingClientRect();
        return {
          points: points.map(([x, y]) => {
            const screen = view.worldToScreen(x, y);
            return { x: rect.left + screen.x, y: rect.top + screen.y };
          }),
          canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          pixelsPerMm: view.getZoom(),
        };
      },
    }),

    defineOp({
      op: "sketch.capture",
      description: "Снимок канваса открытого эскиза в PNG. Возвращает { mime: \"image/png\", dataBase64, width, height }. Только в режиме эскиза.",
      run: () => {
        const { element } = canvas();
        return {
          mime: "image/png",
          dataBase64: element.toDataURL("image/png").slice(PNG_PREFIX.length),
          width: element.width,
          height: element.height,
        };
      },
    }),

    defineOp({
      op: "sketch.start",
      description:
        "Открывает новый эскиз на базовой плоскости (plane) или на плоской грани тела (bodyId + faceId) — то же, что кнопка «Эскиз» и клик по плоскости. Открытая панель инструмента закрывается. У эскиза на грани в сущностях появляются линии построения по контуру грани. Возвращает то же, что sketch.get. Дальше — sketch.addEntities и sketch.finish.",
      mutates: true,
      params: placementParams,
      run: start,
    }),

    defineOp({
      op: "sketch.addEntities",
      description:
        "Добавляет сущности в открытый эскиз одним шагом истории эскиза. Возвращает { sketchId, entityIds, entityCount }. Только в режиме эскиза.",
      mutates: true,
      params: { entities: sketchEntitiesParam(ENTITIES_HELP) },
      run: ({ entities }) => addEntities(entities),
    }),

    defineOp({
      op: "sketch.finish",
      description:
        "Сохраняет открытый эскиз и выходит из режима эскиза — кнопка «ОК»; зависимые операции перестраиваются. Возвращает { sketchId, entityCount, mode }. sketchId подходит для extrude и revolve.",
      mutates: true,
      run: finish,
    }),

    defineOp({
      op: "sketch.cancel",
      description: "Закрывает открытый эскиз без сохранения — кнопка «Отмена». Возвращает { mode }.",
      mutates: true,
      run: () => {
        context.requireSketchMode();
        sketchFlow.handleSketchCancel();
        return { mode: context.mode() };
      },
    }),

    defineOp({
      op: "sketch.create",
      description:
        "Создаёт эскиз целиком: открывает его на базовой плоскости или плоской грани, добавляет сущности, сохраняет и возвращается в режим модели. Возвращает { sketchId, entityCount, mode }. При ошибке эскиз закрывается без сохранения.",
      mutates: true,
      params: { ...placementParams, entities: sketchEntitiesParam(ENTITIES_HELP) },
      run: ({ entities, ...placement }) => create(placement, entities),
    }),
  ];
}
