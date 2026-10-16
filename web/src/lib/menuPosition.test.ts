import { describe, expect, it } from "vitest";
import { clampMenuPosition } from "./menuPosition";

const viewport = { width: 1000, height: 600 };
const box = { width: 200, height: 300 };

describe("clampMenuPosition", () => {
  it("оставляет меню у курсора, если оно помещается", () => {
    expect(clampMenuPosition(100, 100, box, viewport)).toEqual({ left: 100, top: 100 });
  });

  it("поднимает меню, которое вылезает за нижний край", () => {
    expect(clampMenuPosition(100, 500, box, viewport)).toEqual({ left: 100, top: 292 });
  });

  it("сдвигает меню влево у правого края", () => {
    expect(clampMenuPosition(950, 100, box, viewport)).toEqual({ left: 792, top: 100 });
  });

  it("меню выше окна прижимается к верхнему краю", () => {
    expect(clampMenuPosition(100, 500, { width: 200, height: 800 }, viewport).top).toBe(8);
  });
});
