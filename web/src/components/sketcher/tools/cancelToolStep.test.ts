import { describe, expect, it } from "vitest";
import { ArcTool } from "./ArcTool";
import { CircleTool } from "./CircleTool";
import { LineTool } from "./LineTool";
import { RectangleTool } from "./RectangleTool";
import { ThreePointArcTool } from "./ThreePointArcTool";
import { cancelToolStep } from "./cancelToolStep";

const context = {
  screenToWorld: (x: number, y: number) => ({ x, y }),
  nextId: () => "new-id",
  pixelsToWorld: (px: number) => px,
};

describe("cancelToolStep", () => {
  for (const [name, create] of [
    ["line", () => new LineTool()],
    ["rectangle", () => new RectangleTool()],
    ["circle", () => new CircleTool()],
    ["arc", () => new ArcTool()],
    ["three-point arc", () => new ThreePointArcTool()],
  ] as const) {
    it(`drops the unfinished ${name} and starts the next one at a new point`, () => {
      const tool = create();
      expect(cancelToolStep(tool)).toBe(false);

      tool.onMouseDown(10, 10, context);
      tool.onMouseMove(20, 30, context);
      expect(tool.isActive()).toBe(true);
      expect(tool.getPreview()).not.toBeNull();

      expect(cancelToolStep(tool)).toBe(true);
      expect(tool.isActive()).toBe(false);
      expect(tool.getPreview()).toBeNull();
      expect(tool.onMouseUp(20, 30, context)).toBeNull();

      tool.onMouseDown(70, 80, context);
      tool.onMouseMove(75, 85, context);
      expect(tool.isActive()).toBe(true);
      const preview = tool.getPreview();
      if (preview?.type === "line") expect(preview.start).toEqual({ x: 70, y: 80 });
      else if (preview?.type === "rectangle") expect(preview.corner1).toEqual({ x: 70, y: 80 });
      else if (preview?.type === "circle" || preview?.type === "arc") {
        expect(preview.center).toEqual({ x: 70, y: 80 });
      } else {
        expect.fail("new drawing preview is missing");
      }
    });
  }
});
