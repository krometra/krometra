import { bytesToBase64 } from "@/lib/control/base64";
import { cameraViewParam, resolveCameraView, type CameraViewInput } from "@/lib/control/cameraView";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param, type Vec3 } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { WORLD_UP } from "@/lib/orientation";
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
        "Ставит камеру 3D-вьюпорта в заданную точку сразу, без анимации: следующий кадр и viewport.capture уже покажут новый ракурс. Документ не меняет. Возвращает итоговое { position, target, up }.",
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
        "Снимок 3D-вьюпорта текущей камерой в PNG. Возвращает { mime: \"image/png\", dataBase64, width, height }. Без размеров снимает в размере канваса; при другом соотношении сторон кадр обрезается по центру.",
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
