import { describe, expect, it } from "vitest";
import { browserProfileCenter, browserProfilesOf } from "./browserProfile";
import type { SketchEntity } from "@/types/api";

const square: SketchEntity[] = [
  { id: "l1", type: "line", start: { x: -10, y: -10 }, end: { x: 10, y: -10 } },
  { id: "l2", type: "line", start: { x: 10, y: -10 }, end: { x: 10, y: 10 } },
  { id: "l3", type: "line", start: { x: 10, y: 10 }, end: { x: -10, y: 10 } },
  { id: "l4", type: "line", start: { x: -10, y: 10 }, end: { x: -10, y: -10 } },
];

describe("browserProfilesOf", () => {
  it("принимает окружность внутри составного профиля как точное отверстие", () => {
    const [profile] = browserProfilesOf([
      ...square,
      { id: "hole", type: "circle", center: { x: 0, y: 0 }, radius: 4, construction: false },
    ]);

    expect("holes" in profile && profile.holes[0].segments.map((s) => s.kind)).toEqual(["arc", "arc"]);
    expect(browserProfileCenter(profile)).toEqual({ x: 0, y: 0 });
  });

  it("сообщает об отсутствии контура, а не о лишних регионах", () => {
    expect(() => browserProfilesOf([])).toThrow("нет замкнутого контура");
  });

  it("возвращает каждый несвязанный регион отдельным профилем", () => {
    const profiles = browserProfilesOf([
      { id: "a", type: "circle", center: { x: 0, y: 0 }, radius: 2, construction: false },
      { id: "b", type: "circle", center: { x: 10, y: 0 }, radius: 2, construction: false },
    ]);

    const centers = profiles.map(browserProfileCenter);
    expect(centers).toHaveLength(2);
    expect(centers[0].x).toBeCloseTo(0);
    expect(centers[1].x).toBeCloseTo(10);
  });

  it("оставляет остров в отверстии отдельным регионом", () => {
    const profiles = browserProfilesOf([
      ...square,
      { id: "hole", type: "circle", center: { x: 0, y: 0 }, radius: 6, construction: false },
      { id: "island", type: "circle", center: { x: 0, y: 0 }, radius: 2, construction: false },
    ]);

    expect(profiles).toHaveLength(2);
    expect(profiles.map((profile) => ("holes" in profile ? profile.holes.length : 0)).sort()).toEqual([0, 1]);
  });
});
