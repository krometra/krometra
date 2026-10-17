import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { SketchEntity } from "@/types/api";
import { LINE_MIDPOINT } from "@/sketcher/sketchPoints";
import type { EdgeDragApi } from "./useEdgeDrag";
import { useSketchPicking } from "./useSketchPicking";
import { useSketchSelection } from "./useSketchSelection";

const side: SketchEntity = { id: "s", type: "line", start: { x: 10, y: 10 }, end: { x: 50, y: 10 } };
const edge: SketchEntity = { id: "face-edge-1-1", type: "line", start: { x: 10, y: 30 }, end: { x: 50, y: 30 }, construction: true };
const aux: SketchEntity = { id: "aux", type: "infline", point: { x: 0, y: 60 }, angle: 0 };

function setup() {
  const entities = ref<SketchEntity[]>([side, edge, aux]);
  const selection = useSketchSelection(entities);
  const edgeDrag = { start: vi.fn() } as unknown as EdgeDragApi;
  const picking = useSketchPicking({ entities, zoom: () => 1, selection, edgeDrag });
  return { picking, selection, edgeDrag, entities };
}

describe("useSketchPicking", () => {
  it("клик по концу и середине отрезка выбирает точки, можно больше двух элементов", () => {
    const { picking, selection } = setup();
    picking.selectAt({ x: 10, y: 11 });
    picking.selectAt({ x: 30, y: 10.5 });
    picking.selectAt({ x: 0.5, y: 0.5 });
    expect(selection.items.value).toEqual([
      { kind: "point", entityId: "s", subIndex: 0 },
      { kind: "point", entityId: "s", subIndex: LINE_MIDPOINT },
      { kind: "origin" },
    ]);
  });

  it("обычный отрезок начинает перетаскивание, вспомогательная геометрия выбирается сразу", () => {
    const { picking, selection, edgeDrag } = setup();
    picking.selectAt({ x: 20, y: 10 });
    expect(edgeDrag.start).toHaveBeenCalledWith(side, { x: 20, y: 10 });
    picking.selectAt({ x: 20, y: 30 });
    picking.selectAt({ x: 200, y: 60.5 });
    picking.selectAt({ x: -200, y: 0.5 });
    expect(selection.items.value).toEqual([
      { kind: "entity", entityId: "face-edge-1-1" },
      { kind: "entity", entityId: "aux" },
      { kind: "axis", axis: "x" },
    ]);
    expect(selection.entityIds.value).toEqual(["face-edge-1-1", "aux"]);
  });

  it("клик в пустоте снимает выделение", () => {
    const { picking, selection } = setup();
    picking.selectAt({ x: 20, y: 30 });
    expect(picking.selectAt({ x: 200, y: 200 })).toBe(false);
    expect(selection.items.value).toEqual([]);
  });

  it("в инструменте рисования вспомогательная геометрия не перехватывает клик", () => {
    const { picking, selection } = setup();
    expect(picking.selectDrawableAt({ x: 20, y: 30 })).toBe(false);
    expect(selection.items.value).toEqual([]);
  });

  it("ховер точки даёт маркер с подписью, ховер оси — цель-ось", () => {
    const { picking } = setup();
    picking.hoverItemAt({ x: 50, y: 30.5 });
    expect(picking.hoveredPoint.value).toEqual({ at: { x: 50, y: 30 }, label: "Конец" });
    expect(picking.hoveredEntityId.value).toBeNull();
    picking.hoverItemAt({ x: 1, y: -100 });
    expect(picking.hoveredTarget.value).toMatchObject({ kind: "line", infinite: true });
    picking.hoverEntityAt({ x: 20, y: 30.5 });
    expect(picking.hoveredEntityId.value).toBe("face-edge-1-1");
  });

  it("цели выделения обновляются вместе с геометрией", () => {
    const { picking, selection, entities } = setup();
    picking.selectAt({ x: 50, y: 11 });
    entities.value = [{ ...side, end: { x: 70, y: 10 } }, edge, aux];
    expect(selection.targets()).toEqual([{ kind: "point", ref: { entity_id: "s", sub_index: 1 }, at: { x: 70, y: 10 }, label: "Конец" }]);
    entities.value = [edge];
    expect(selection.targets()).toEqual([null]);
  });
});
