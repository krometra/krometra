import { describe, expect, it } from "vitest";
import {
  bboxCorners,
  countersinkDepth,
  DEFAULT_HOLE_SPEC,
  distinctCenters,
  drillTipLength,
  HoleError,
  holeOuterDiameter,
  holePolygon,
  holePreviews,
  holeProfile,
  holeRoleProbes,
  holeThroughDepth,
  projectOntoPlane,
  sketchHoleCenters,
  THROUGH_MARGIN,
  validateHoleSpec,
  type HoleSpec,
} from "./holeGeometry";
import type { Vec3 } from "./threadGeometry";

const spec = (patch: Partial<HoleSpec>): HoleSpec => ({ ...DEFAULT_HOLE_SPEC, ...patch });
const down: Vec3 = [0, 0, -1];

function expectPoint(actual: Vec3, expected: Vec3) {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 9));
}

describe("профиль отверстия", () => {
  it("простое с плоским дном: крышка над гранью, стенка и дно", () => {
    const profile = holeProfile(spec({ diameter: 6, depth: 10 }), 99);

    expect(profile.roles).toEqual(["cap", "wall", "floor"]);
    expect(profile.points[0][1]).toBeCloseTo(-0.15, 12);
    expect(profile.points.slice(2)).toEqual([[3, 10], [0, 10]]);
  });

  it("дно-конус заканчивается остриём сверла 118°", () => {
    const profile = holeProfile(spec({ diameter: 6, depth: 10, bottom: "cone" }), 99);

    expect(profile.roles.at(-1)).toBe("tip");
    expect(profile.points.at(-1)).toEqual([0, 10 + drillTipLength(6)]);
    expect(drillTipLength(6)).toBeCloseTo(3 / Math.tan((59 * Math.PI) / 180), 12);
  });

  it("цековка ступенькой переходит в основное отверстие", () => {
    const profile = holeProfile(spec({ type: "counterbore", diameter: 5, depth: 12, cboreDiameter: 9, cboreDepth: 4 }), 99);

    expect(profile.roles).toEqual(["cap", "cbore-wall", "cbore-floor", "wall", "floor"]);
    expect(profile.points[1][0]).toBe(4.5);
    expect(profile.points.slice(2, 5)).toEqual([[4.5, 4], [2.5, 4], [2.5, 12]]);
  });

  it("зенковка — конус от грани вглубь до диаметра отверстия", () => {
    const hole = spec({ type: "countersink", diameter: 5, depth: 12, csinkDiameter: 10, csinkAngle: 90 });
    const profile = holeProfile(hole, 99);

    expect(countersinkDepth(hole)).toBeCloseTo(2.5, 12);
    expect(profile.roles).toEqual(["cap", "csink-rim", "csink", "wall", "floor"]);
    expect(profile.points[2]).toEqual([5, 0]);
    expect(profile.points[3][0]).toBe(2.5);
    expect(profile.points[3][1]).toBeCloseTo(2.5, 12);
  });

  it("насквозь берёт длину из габарита тела и выходит плоским торцом", () => {
    const profile = holeProfile(spec({ extent: "through_all", depth: 0, bottom: "cone" }), 21);

    expect(profile.roles.at(-1)).toBe("exit");
    expect(profile.points.at(-1)).toEqual([0, 21]);
  });

  it("внешний диаметр — у цековки и зенковки свой", () => {
    expect(holeOuterDiameter(spec({ diameter: 5 }))).toBe(5);
    expect(holeOuterDiameter(spec({ type: "counterbore", cboreDiameter: 9 }))).toBe(9);
    expect(holeOuterDiameter(spec({ type: "countersink", csinkDiameter: 11 }))).toBe(11);
  });
});

describe("проверка параметров отверстия", () => {
  it.each<[string, Partial<HoleSpec>, string]>([
    ["нулевой диаметр", { diameter: 0 }, "bad_diameter"],
    ["нулевая глубина", { depth: 0 }, "bad_depth"],
    ["неизвестный тип", { type: "tapped" as HoleSpec["type"] }, "bad_kind"],
    ["цековка уже отверстия", { type: "counterbore", cboreDiameter: 5 }, "bad_counterbore"],
    ["цековка глубже отверстия", { type: "counterbore", cboreDepth: 10 }, "bad_counterbore"],
    ["зенковка уже отверстия", { type: "countersink", csinkDiameter: 4 }, "bad_countersink"],
    ["угол зенковки 180°", { type: "countersink", csinkAngle: 180 }, "bad_countersink"],
    ["конус зенковки глубже отверстия", { type: "countersink", depth: 2, csinkDiameter: 20 }, "bad_countersink"],
  ])("отклоняет: %s", (_name, patch, code) => {
    expect(() => validateHoleSpec(spec(patch))).toThrow(HoleError);
    try {
      validateHoleSpec(spec(patch));
    } catch (error) {
      expect((error as HoleError).code).toBe(code);
    }
  });

  it("насквозь не проверяет глубину и глубину цековки", () => {
    expect(() => validateHoleSpec(spec({ type: "counterbore", extent: "through_all", depth: 0, cboreDepth: 50 }))).not.toThrow();
  });
});

describe("размещение отверстий", () => {
  it("насквозь — до самого дальнего угла габарита вдоль оси плюс запас", () => {
    const corners = bboxCorners([0, 0, 0], [40, 20, 20]);

    expect(corners).toHaveLength(8);
    expect(holeThroughDepth(corners, [10, 10, 20], down)).toBeCloseTo(20 + THROUGH_MARGIN, 12);
  });

  it("проецирует точку на плоскость грани вдоль нормали", () => {
    expectPoint(projectOntoPlane([3, 4, 7], [0, 0, 20], [0, 0, 1]), [3, 4, 20]);
  });

  it("строит контур в плоскости, проходящей через ось, и пробы ролей на поверхностях", () => {
    const profile = holeProfile(spec({ diameter: 6, depth: 10 }), 99);
    const polygon = holePolygon(profile, [10, 10, 20], down);
    const probes = holeRoleProbes(profile, [10, 10, 20], down);

    expectPoint(polygon[0], [10, 10, 20.15]);
    expect(Math.hypot(polygon[2][0] - 10, polygon[2][1] - 10)).toBeCloseTo(3, 12);
    expect(polygon[2][2]).toBeCloseTo(10, 12);
    expect(probes.map((probe) => probe.key)).toEqual(["cap", "wall", "floor"]);
    const wall = probes[1].point;
    expect(Math.hypot(wall[0] - 10, wall[1] - 10)).toBeCloseTo(3, 12);
    expect(wall[2]).toBeCloseTo(15.075, 12);
    expect(probes[2].point[2]).toBeCloseTo(10, 12);
  });

  it("центры из эскиза — окружности, переведённые в мировые координаты плоскости", () => {
    const centers = sketchHoleCenters({
      entities: [
        { id: "a", type: "circle", center: { x: 1, y: 2 }, radius: 1 },
        { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } },
        { id: "b", type: "circle", center: { x: -3, y: 0 }, radius: 2, construction: true },
      ],
      plane: "XZ",
      planeOffset: 5,
      planeBasis: null,
    });

    expect(centers).toEqual([[1, 5, 2], [-3, 5, 0]]);
  });

  it("призраки: на каждый центр свой профиль, насквозь — до дальнего края тела", () => {
    const corners = bboxCorners([0, 0, 0], [40, 20, 20]);
    const previews = holePreviews(spec({ extent: "through_all" }), [[10, 10, 20], [30, 10, 20]], down, corners);

    expect(previews.map((preview) => preview.center)).toEqual([[10, 10, 20], [30, 10, 20]]);
    expect(previews[0].axis).toEqual(down);
    expect(previews[0].points.at(-1)).toEqual([0, 20 + THROUGH_MARGIN]);
  });

  it("убирает совпадающие центры", () => {
    expect(distinctCenters([[0, 0, 0], [1, 0, 0], [0, 0, 1e-9]])).toEqual([[0, 0, 0], [1, 0, 0]]);
  });
});
