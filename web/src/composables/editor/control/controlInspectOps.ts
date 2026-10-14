import { browserPlaneFrame } from "@/lib/browserExtrudeFrame";
import { defineOp, type ControlOp } from "@/lib/control/dispatcher";
import { param } from "@/lib/control/params";
import { fail } from "@/lib/control/protocol";
import { sectionContours } from "@/lib/sectionContours";
import { drawSection } from "./canvasImages";
import type { EditorControlContext } from "./controlContext";

export function inspectOps(context: EditorControlContext): ControlOp[] {
  function sectionBodies(bodyIds: string[] | undefined): string[] {
    const bodies = context.model.bodies.value;
    if (!bodyIds) return bodies.filter((body) => body.visible !== false).map((body) => body.id);
    const known = new Set(bodies.map((body) => body.id));
    const missing = bodyIds.filter((bodyId) => !known.has(bodyId));
    if (missing.length > 0) throw fail("not_found", `В документе нет тел: ${missing.join(", ")}. Список тел — op "state".`);
    return bodyIds;
  }

  return [
    defineOp({
      op: "section",
      description:
        "Сечение тел плоскостью — проверка внутренней геометрии без экспорта: зазоры, толщины стенок, отверстия. Плоскость — базовая XY, XZ или YZ, смещённая на offset вдоль своей нормали (как у sketch.create). Возвращает { plane, offset, basis: { origin, u, v, n }, bodies: [{ bodyId, name, contours: [{ closed, points: [[x, y], …], length, area, bbox: { min, max } }] }] }: точки — в координатах плоскости (мм; мировая точка = origin + x·u + y·v), контуры каждого тела — по убыванию площади, у незамкнутого area = null. Тело, которое плоскость не задевает, получает пустой contours. Модель не меняет.",
      params: {
        plane: param.oneOf(["XY", "XZ", "YZ"], "Базовая плоскость сечения."),
        offset: param.optional(param.number("Смещение плоскости вдоль её нормали в мм (XY — по Z, XZ — по Y, YZ — по X). По умолчанию 0.")),
        bodyIds: param.optional(param.list(param.id("Тело."), "Тела из op state. По умолчанию — все видимые.")),
        image: param.optional(param.boolean("Добавить в ответ image: { mime, dataBase64 } — PNG контуров, тела разными цветами (null, если сечение пустое). По умолчанию false.")),
      },
      run: async ({ plane, offset, bodyIds, image }) => {
        const ids = sectionBodies(bodyIds);
        const basis = browserPlaneFrame({ plane, planeOffset: offset ?? 0, planeBasis: null, center: { x: 0, y: 0 } });
        const { sectionBrowserBodies } = await import("../useBrowserGeometry");
        const sections = await sectionBrowserBodies(ids, basis.origin, basis.n);
        const bodies = sections.map((section) => ({
          bodyId: section.bodyId,
          name: context.names.bodyLabel(section.bodyId),
          contours: sectionContours(section.polylines, basis),
        }));
        const result = { plane, offset: offset ?? 0, basis, bodies };
        if (!image) return result;
        const picture = drawSection({ title: `Сечение ${plane}, смещение ${offset ?? 0} мм`, bodies });
        return { ...result, image: picture ? { mime: "image/png", dataBase64: picture } : null };
      },
    }),
  ];
}
