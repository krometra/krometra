import { describe, expect, it } from "vitest";
import type { SketchEntity } from "@/types/api";
import { asConstruction, canBeConstruction, setConstructionFlag, toggledConstructionFlag } from "./construction";

const line: SketchEntity = { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
const circle: SketchEntity = { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 3, construction: true };
const infline: SketchEntity = { id: "i", type: "infline", point: { x: 0, y: 0 }, angle: 0 };

describe("construction", () => {
  it("бесконечная прямая всегда вспомогательная и флага не получает", () => {
    expect(canBeConstruction(infline)).toBe(false);
    expect(asConstruction(infline)).toBe(infline);
    expect(canBeConstruction(line)).toBe(true);
  });

  it("asConstruction помечает копию, не трогая исходник", () => {
    const marked = asConstruction(line);
    expect(marked).toEqual({ ...line, construction: true });
    expect(line).not.toHaveProperty("construction");
  });

  it("переключение: есть обычная среди выбранных - все становятся вспомогательными, иначе обычными", () => {
    expect(toggledConstructionFlag([line, circle], ["l", "c"])).toBe(true);
    expect(toggledConstructionFlag([line, circle], ["c"])).toBe(false);
    expect(toggledConstructionFlag([line, circle, infline], ["i"])).toBeNull();
    expect(toggledConstructionFlag([line], [])).toBeNull();
  });

  it("setConstructionFlag меняет только указанные и снимает флаг без следа", () => {
    const entities = [line, circle, infline];
    const on = setConstructionFlag(entities, ["l", "i"], true);
    expect(on[0]).toEqual({ ...line, construction: true });
    expect(on[1]).toBe(circle);
    expect(on[2]).toBe(infline);
    const off = setConstructionFlag(on, ["l", "c"], false);
    expect(off[0]).toEqual(line);
    expect(off[1]).not.toHaveProperty("construction");
  });
});
