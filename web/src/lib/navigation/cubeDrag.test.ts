import { describe, expect, it } from "vitest";
import { CUBE_DRAG_SLOP_PX, CUBE_ORBIT_RADIANS_PER_PX, beginCubeDrag, moveCubeDrag } from "./cubeDrag";

describe("перетаскивание ViewCube", () => {
  it("дрожь руки в пределах порога остаётся кликом", () => {
    const start = beginCubeDrag(100, 100);
    const { drag, orbit } = moveCubeDrag(start, 100 + CUBE_DRAG_SLOP_PX, 100);
    expect(orbit).toBeNull();
    expect(drag.dragging).toBe(false);
  });

  it("за порогом начинается вращение на всё пройденное расстояние", () => {
    const { drag, orbit } = moveCubeDrag(beginCubeDrag(100, 100), 110, 94);
    expect(drag.dragging).toBe(true);
    expect(orbit?.azimuth).toBeCloseTo(10 * CUBE_ORBIT_RADIANS_PER_PX, 12);
    expect(orbit?.elevation).toBeCloseTo(-6 * CUBE_ORBIT_RADIANS_PER_PX, 12);
  });

  it("дальше вращает на приращение, а возврат к исходной точке не превращает протяжку в клик", () => {
    let state = moveCubeDrag(beginCubeDrag(0, 0), 20, 0).drag;
    const next = moveCubeDrag(state, 25, 3);
    expect(next.orbit?.azimuth).toBeCloseTo(5 * CUBE_ORBIT_RADIANS_PER_PX, 12);
    expect(next.orbit?.elevation).toBeCloseTo(3 * CUBE_ORBIT_RADIANS_PER_PX, 12);
    state = moveCubeDrag(next.drag, 0, 0).drag;
    expect(state.dragging).toBe(true);
  });
});
