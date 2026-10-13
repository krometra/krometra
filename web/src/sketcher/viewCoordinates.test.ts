import { describe, expect, it } from "vitest";
import { RectangleTool } from "@/components/sketcher/tools/RectangleTool";
import { isPointNearEntity } from "./geometry";
import { screenToWorld, visibleWorldBounds, worldToScreen } from "./viewCoordinates";

describe("sketcher view coordinates", () => {
  const view = { offsetX: 400, offsetY: 300, zoom: 2 };

  it("maps a drag upward to positive model Y and picks its visible edge", () => {
    const tool = new RectangleTool();
    const context = {
      screenToWorld: (x: number, y: number) => screenToWorld(x, y, view),
      nextId: () => "rect",
      pixelsToWorld: (px: number) => px / view.zoom,
    };

    tool.onMouseDown(400, 300, context);
    tool.onMouseMove(440, 260, context);
    const edges = tool.onMouseUp(440, 260, context);

    expect(edges).not.toBeNull();
    expect(edges![0]).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 20, y: 0 } });
    expect(edges![2]).toMatchObject({ start: { x: 20, y: 20 }, end: { x: 0, y: 20 } });
    expect(worldToScreen(20, 20, view)).toEqual({ x: 440, y: 260 });
    expect(isPointNearEntity(screenToWorld(420, 260, view), edges![2], 1)).toBe(true);
  });

  it("keeps screen and world coordinates inverse across a zoomed view", () => {
    const point = { x: -12, y: 35 };
    const screen = worldToScreen(point.x, point.y, view);
    expect(screenToWorld(screen.x, screen.y, view)).toEqual(point);
    expect(visibleWorldBounds(800, 600, view)).toEqual({
      left: -200,
      top: 150,
      right: 200,
      bottom: -150,
    });
  });
});
