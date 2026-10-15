import { bytesToBase64 } from "@/lib/control/base64";
import { cameraViewParam, resolveCameraView, type CameraViewInput } from "@/lib/control/cameraView";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param, type Vec3 } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { WORLD_UP } from "@/lib/orientation";
import { basePlaneTarget, type CameraPose } from "@/lib/lookAtView";
import type { EditorControlContext } from "./controlContext";

const FALLBACK_CAPTURE_SIZE = { width: 1280, height: 800 };

export function viewportOps(context: EditorControlContext): ControlOp[] {
  function cameraState() {
    const { position, target, up } = context.viewport().getCameraState();
    const tuple = (vector: { x: number; y: number; z: number }): Vec3 => [vector.x, vector.y, vector.z];
    return { position: tuple(position), target: tuple(target), up: tuple(up) };
  }

  function resolveView(input: CameraViewInput) {
    return resolveCameraView(input, { target: cameraState().target, up: WORLD_UP.toArray() });
  }

  function lookAt(params: { plane?: "XY" | "XZ" | "YZ"; bodyId?: string; faceId?: string }): CameraPose | null {
    const viewport = context.viewport();
    if (params.plane) return viewport.lookAt(basePlaneTarget(params.plane, viewport.modelBounds()));
    if (!params.bodyId || !params.faceId) throw fail("invalid_params", "Задайте plane либо bodyId вместе с faceId.");
    context.bodyMesh(params.bodyId);
    const pose = viewport.lookAtFace(params.bodyId, params.faceId);
    if (!pose) throw fail("operation_failed", `Грань «${params.faceId}» не найдена во вьюпорте или не плоская: вид по нормали строится только к плоской грани.`);
    return pose;
  }

  function canvasSize() {
    const canvas = context.viewport().projectPoints([])?.canvas;
    return canvas && canvas.width > 0 && canvas.height > 0
      ? { width: Math.round(canvas.width), height: Math.round(canvas.height) }
      : FALLBACK_CAPTURE_SIZE;
  }

  return [
    defineOp({
      op: "camera.get",
      description: "Положение камеры 3D-вьюпорта (мм, сцена Z-up). Возвращает { position: [x,y,z], target: [x,y,z], up: [x,y,z] }.",
      run: cameraState,
    }),

    defineOp({
      op: "camera.set",
      description:
        "Ставит камеру 3D-вьюпорта в заданную точку сразу, без анимации, полностью перезаписывая её состояние (в том числе после сбоя с NaN): следующий кадр и viewport.capture уже покажут новый ракурс. Документ не меняет. Возвращает итоговое { position, target, up }.",
      params: {
        position: param.vec3("Позиция камеры [x, y, z], мм."),
        target: param.optional(param.vec3("Точка, на которую смотрит камера, [x, y, z]. По умолчанию — текущая цель орбиты.")),
        up: param.optional(param.vec3("Вектор «вверх» [x, y, z]. По умолчанию [0, 0, 1].")),
      },
      run: (params) => {
        context.viewport().setCameraView(resolveView(params));
        return cameraState();
      },
    }),

    defineOp({
      op: "camera.fit",
      description:
        "Вписывает видимые тела в кадр — кнопка «Вписать модель»: направление взгляда сохраняется, меняются цель и расстояние. Если камера сломана (например, NaN после сбоя), ставит изометрию. Документ не меняет. Возвращает итоговое { position, target, up }.",
      run: () => {
        context.viewport().fitAllBodies();
        return cameraState();
      },
    }),

    defineOp({
      op: "camera.lookAt",
      description:
        "Вид по нормали — кнопка «Вид по нормали» и пункт меню грани: камера плавно (около 0.4 с) встаёт на нормаль к плоской грани и вписывает её либо к базовой плоскости и вписывает модель (XY — сверху, XZ — спереди, YZ — справа). Верх экрана — мировой +Z, у видов сверху и снизу — как у ViewCube. Документ не меняет. Возвращает { position, target, up }, куда прилетит камера.",
      params: {
        plane: param.optional(param.oneOf(["XY", "XZ", "YZ"], "Базовая плоскость. Взаимоисключается с bodyId/faceId.")),
        bodyId: param.optional(param.id("Тело грани из op state.")),
        faceId: param.optional(param.id("Плоская грань из op topology или face.find.")),
      },
      run: (params) => {
        const pose = lookAt(params);
        if (!pose) throw fail("not_ready", "Сцена вьюпорта ещё не создана.");
        return pose;
      },
    }),

    defineOp({
      op: "viewport.setHelpers",
      description:
        "Показывает или прячет вспомогательную графику 3D-вьюпорта: сетку и контуры сохранённых эскизов — для чистого снимка детали. Документ не меняет, действует до перезагрузки страницы. Возвращает итоговое { grid, sketchOutlines }.",
      params: {
        grid: param.optional(param.boolean("Показывать сетку.")),
        sketchOutlines: param.optional(param.boolean("Показывать контуры сохранённых эскизов.")),
      },
      run: (helpers) => context.viewport().setHelpersVisible(helpers),
    }),

    defineOp({
      op: "selection.setEdgeChain",
      description:
        "Включает или выключает касательную цепочку выбора рёбер — чекбокс «Касательная цепочка» в панели скругления и фаски. Действует только на клики мышью: с цепочкой клик по ребру берёт его со всеми касательными продолжениями, без неё — одно ребро. На edgeIds операций fillet и chamfer не влияет. Документ не меняет. Возвращает итоговое { edgeChain }.",
      params: { enabled: param.boolean("true — клик берёт касательную цепочку, false — одно ребро.") },
      run: ({ enabled }) => {
        context.filletChamfer.setChain(enabled);
        return { edgeChain: context.filletChamfer.chain.value };
      },
    }),

    defineOp({
      op: "viewport.isolate",
      description:
        "Временно показывает во вьюпорте только перечисленные тела (в том числе скрытые и поглощённые) — для снимка отдельного компонента. Документ и видимость тел в нём не меняются; без bodyIds возвращает обычную видимость. Изоляция сбрасывается и при перезагрузке тел после любой операции. Возвращает { isolated: [id] | null }.",
      params: {
        bodyIds: param.optional(param.list(param.id("Тело."), "Тела из op state (allBodies = true для поглощённых): [id, …].")),
      },
      run: ({ bodyIds }) => {
        const known = new Set(context.model.bodies.value.map((body) => body.id));
        const missing = (bodyIds ?? []).filter((bodyId) => !known.has(bodyId));
        if (missing.length > 0) throw fail("not_found", `В документе нет тел: ${missing.join(", ")}. Список тел — op "state".`);
        context.viewport().isolateBodies(bodyIds ?? null);
        return { isolated: bodyIds ?? null };
      },
    }),

    defineOp({
      op: "viewport.project",
      description:
        "Проецирует точки модели (мм) в клиентские координаты страницы — туда, куда кликать мышью. Возвращает { points: [{ x, y, behind, inside }], canvas: { left, top, width, height } }: behind — точка за камерой, inside — точка попадает в канвас. С параметром camera считает проекцию для гипотетического ракурса, не двигая настоящую камеру: так подбирают ракурс, где нужное ребро не сливается с соседними. В режиме эскиза 3D-вьюпорт скрыт — ответ wrong_mode.",
      params: {
        points: param.list(param.vec3("Точка [x, y, z]."), "Точки модели: [[x, y, z], …].", 0),
        camera: param.optional(
          cameraViewParam("Гипотетический ракурс { position, target?, up? }; target по умолчанию — текущая цель орбиты, up — [0, 0, 1]."),
        ),
      },
      run: ({ points, camera }) => {
        const projection = context.viewport().projectPoints(points, camera ? resolveView(camera) : undefined);
        if (!projection) throw fail("not_ready", "Сцена вьюпорта ещё не создана.");
        if (projection.canvas.width === 0 || projection.canvas.height === 0) {
          throw fail("wrong_mode", "3D-вьюпорт сейчас скрыт (открыт эскиз): проекция в координаты страницы недоступна.");
        }
        return projection;
      },
    }),

    defineOp({
      op: "viewport.capture",
      description:
        "Снимок 3D-вьюпорта текущей камерой в PNG, без визуального сечения режима «Сечение». Возвращает { mime: \"image/png\", dataBase64, width, height }. Без размеров снимает в размере канваса; при другом соотношении сторон кадр обрезается по центру.",
      params: {
        width: param.optional(param.integer("Ширина снимка в пикселях.", { min: 16, max: 4096 })),
        height: param.optional(param.integer("Высота снимка в пикселях.", { min: 16, max: 4096 })),
      },
      run: async ({ width, height }) => {
        const size = canvasSize();
        const target = { width: width ?? size.width, height: height ?? size.height };
        const image = await context.viewport().captureImage(target.width, target.height);
        if (!image) throw fail("operation_failed", "Вьюпорт не отдал изображение: сцена ещё не отрисована.");
        return { mime: "image/png", dataBase64: bytesToBase64(new Uint8Array(await image.arrayBuffer())), ...target };
      },
    }),
  ];
}
