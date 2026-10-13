import { describe, expect, it } from "vitest";
import { snapAt } from "@/sketcher/snapCandidates";
import type { SketchEntity } from "@/types/api";
import { CircleTool } from "./CircleTool";

describe("CircleTool with sketch snapping", () => {
  it("builds an inscribed circle from the square center toward a side", () => {
    const sides = [
      { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: "b", type: "line", start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
      { id: "c", type: "line", start: { x: 100, y: 100 }, end: { x: 0, y: 100 } },
      { id: "d", type: "line", start: { x: 0, y: 100 }, end: { x: 0, y: 0 } },
    ] as SketchEntity[];
    const tool = new CircleTool();
    const context = {
      screenToWorld: (x: number, y: number) =>
        snapAt(sides, { x, y }, 5, 50, tool.getCenter())?.point ?? { x, y },
      nextId: () => "circle",
      pixelsToWorld: (px: number) => px,
    };

    tool.onMouseDown(50, 50, context);
    tool.onMouseMove(2, 48, context);
    const circle = tool.onMouseUp(2, 48, context);

    expect(circle).toMatchObject({
      type: "circle",
      center: { x: 50, y: 50 },
      radius: 50,
    });
  });
});
