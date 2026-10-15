import { describe, expect, it } from "vitest";
import { snapAt } from "@/sketcher/snapCandidates";
import type { SketchEntity } from "@/types/api";
import { COLLINEAR_ARC_HINT, ThreePointArcTool } from "./ThreePointArcTool";

const context = {
  screenToWorld: (x: number, y: number) => ({ x, y }),
  nextId: () => "arc3",
  pixelsToWorld: (px: number) => px,
};

function click(tool: ThreePointArcTool, x: number, y: number, ctx = context) {
  tool.onMouseDown(x, y, ctx);
  return tool.onMouseUp(x, y, ctx);
}

describe("ThreePointArcTool", () => {
  it("строит дугу модели: начало, конец, точка на дуге", () => {
    const tool = new ThreePointArcTool();
    expect(click(tool, 10, 0)).toBeNull();
    expect(click(tool, -10, 0)).toBeNull();
    tool.onMouseMove(0, 10, context);
    const arc = click(tool, 0, 10);

    expect(arc).toMatchObject({ id: "arc3", type: "arc", radius: expect.closeTo(10, 6) });
    if (arc?.type !== "arc") throw new Error("ожидалась дуга");
    expect(arc.center.x).toBeCloseTo(0);
    expect(arc.center.y).toBeCloseTo(0);
    expect(arc.startAngle).toBeCloseTo(0);
    expect(arc.endAngle).toBeCloseTo(Math.PI);
    expect(tool.isActive()).toBe(false);
  });

  it("начало и конец можно задать перетаскиванием", () => {
    const tool = new ThreePointArcTool();
    tool.onMouseDown(0, 0, context);
    tool.onMouseMove(20, 0, context);
    expect(tool.onMouseUp(20, 0, context)).toBeNull();
    expect(tool.hint()).toBe("Укажите точку на дуге");
    const arc = click(tool, 10, 5);
    expect(arc?.type).toBe("arc");
  });

  it("предпросмотр: хорда до второго клика, затем дуга под курсором", () => {
    const tool = new ThreePointArcTool();
    click(tool, 0, 0);
    tool.onMouseMove(20, 0, context);
    expect(tool.getPreview()).toMatchObject({ type: "line", start: { x: 0, y: 0 }, end: { x: 20, y: 0 } });

    click(tool, 20, 0);
    tool.onMouseMove(10, -10, context);
    const preview = tool.getPreview();
    expect(preview?.type).toBe("arc");
    if (preview?.type === "arc") expect(preview.radius).toBeCloseTo(10);
  });

  it("на коллинеарной точке не строит дугу и показывает подсказку", () => {
    const tool = new ThreePointArcTool();
    expect(tool.hint()).toContain("начало");
    click(tool, 0, 0);
    expect(tool.hint()).toContain("конец");
    click(tool, 20, 0);
    tool.onMouseMove(10, 0, context);
    expect(tool.hint()).toBe(COLLINEAR_ARC_HINT);
    expect(tool.getPreview()).toMatchObject({ type: "line", end: { x: 20, y: 0 } });
    expect(click(tool, 10, 0)).toBeNull();
    expect(tool.isActive()).toBe(true);

    tool.onMouseMove(10, 4, context);
    expect(tool.hint()).not.toBe(COLLINEAR_ARC_HINT);
    expect(click(tool, 10, 4)?.type).toBe("arc");
  });

  it("клик в ту же точку не принимает конец дуги", () => {
    const tool = new ThreePointArcTool();
    click(tool, 0, 0);
    click(tool, 1, 1);
    expect(tool.hint()).toContain("конец");
  });

  it("концы, попавшие привязкой на концы отрезков, становятся совпадениями", () => {
    const lines = [
      { id: "left", type: "line", start: { x: 0, y: -30 }, end: { x: 0, y: 0 } },
      { id: "right", type: "line", start: { x: 40, y: 0 }, end: { x: 40, y: -30 } },
    ] as SketchEntity[];
    const snapping = {
      ...context,
      screenToWorld: (x: number, y: number) => snapAt(lines, { x, y }, 5, 0)?.point ?? { x, y },
    };
    const tool = new ThreePointArcTool();
    click(tool, 1, 1, snapping);
    click(tool, 39, -1, snapping);
    const arc = click(tool, 20, 20, snapping)!;

    const constraints = tool.detectConstraints(context, [...lines, arc]);
    expect(constraints.map((c) => c.anchors)).toEqual([
      [{ entity_id: "arc3", sub_index: 1 }, { entity_id: "right", sub_index: 0 }],
      [{ entity_id: "arc3", sub_index: 2 }, { entity_id: "left", sub_index: 1 }],
    ]);
  });
});
