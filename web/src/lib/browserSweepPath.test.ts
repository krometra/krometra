import { describe, expect, it } from "vitest";
import type { SketchEntity } from "@/types/api";
import { browserSweepSpine, pipeWorldProbes, sweepSpinePoint, type SweepSketchPlacement } from "./browserSweepPath";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id, type: "line", start: { x: x1, y: y1 }, end: { x: x2, y: y2 },
});

const square: SketchEntity = { id: "r", type: "rectangle", corner1: { x: -1, y: -1 }, corner2: { x: 1, y: 1 } };

const profile = (entities: SketchEntity[] = [square]): SweepSketchPlacement => ({ entities, plane: "XY", planeOffset: 0, planeBasis: null });
const path = (entities: SketchEntity[], plane: SweepSketchPlacement["plane"] = "XZ"): SweepSketchPlacement => ({
  entities, plane, planeOffset: 0, planeBasis: null,
});

const bend: SketchEntity = { id: "a", type: "arc", center: { x: 10, y: 10 }, radius: 10, startAngle: Math.PI / 2, endAngle: Math.PI };

function expectPoint(actual: number[], expected: number[]) {
  expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 6));
}

describe("путь протяжки", () => {
  it("начинается с конца на плоскости профиля и уходит из неё", () => {
    const spine = browserSweepSpine(profile(), path([line("l", 0, 0, 0, 10)]));
    expectPoint(sweepSpinePoint(spine, spine.segments[0].start), [0, 0, 0]);
    expectPoint(sweepSpinePoint(spine, spine.segments[0].end), [0, 0, 10]);
  });

  it("разворачивает путь, если на плоскости профиля лежит его конец", () => {
    const spine = browserSweepSpine(profile(), path([line("l", 0, 10, 0, 0)]));
    expect(spine.segments[0].start).toEqual({ x: 0, y: 0 });
  });

  it("собирает отрезки и дуги в одну цепочку в любом порядке", () => {
    const spine = browserSweepSpine(profile(), path([bend, line("l", 0, 0, 0, 10)]));
    expect(spine.segments.map((segment) => segment.kind)).toEqual(["line", "arc"]);
    expect(spine.segments[1].end.x).toBeCloseTo(10);
    expect(spine.segments[1].end.y).toBeCloseTo(20);
  });

  it("принимает замкнутый путь через вершину на плоскости профиля", () => {
    const loop = [line("a", 0, 0, 10, 0), line("b", 10, 0, 10, 10), line("c", 10, 10, 0, 10), line("d", 0, 10, 0, 0)];
    const spine = browserSweepSpine(profile(), path(loop));
    expect(spine.segments).toHaveLength(4);
    expect(spine.segments[0].start).toEqual({ x: 0, y: 0 });
    expect(spine.segments[0].end).toEqual({ x: 0, y: 10 });
  });

  it("объясняет, на сколько путь не дошёл до плоскости профиля", () => {
    expect(() => browserSweepSpine(profile(), path([line("l", 0, 5, 0, 12)]))).toThrow("в 5 мм от неё");
  });

  it("не принимает путь, начатый в стороне от профиля", () => {
    expect(() => browserSweepSpine(profile(), path([line("l", 20, 0, 20, 10)]))).toThrow("в стороне от него (в 19 мм)");
  });

  it("не принимает путь, лежащий в плоскости профиля", () => {
    expect(() => browserSweepSpine(profile(), path([line("l", 0, 0, 10, 0)], "XY"))).toThrow("вдоль плоскости профиля");
  });

  it("требует одну цепочку без разрывов", () => {
    expect(() => browserSweepSpine(profile(), path([line("a", 0, 0, 0, 5), line("b", 0, 6, 0, 10)]))).toThrow("одной непрерывной цепочкой");
  });

  it("не строит путь из окружности и из пустого эскиза", () => {
    const circle: SketchEntity = { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 3 };
    expect(() => browserSweepSpine(profile(), path([circle]))).toThrow("только из отрезков и дуг");
    expect(() => browserSweepSpine(profile(), path([]))).toThrow("нет отрезков и дуг");
  });

  it("игнорирует вспомогательную геометрию пути", () => {
    const helper = { ...line("h", 5, 5, 8, 8), construction: true } as SketchEntity;
    expect(browserSweepSpine(profile(), path([helper, line("l", 0, 0, 0, 10)])).segments).toHaveLength(1);
  });

  it("требует замкнутый профиль", () => {
    expect(() => browserSweepSpine(profile([line("p", 0, 0, 1, 1)]), path([line("l", 0, 0, 0, 10)]))).toThrow("не замкнут");
  });
});

describe("точки имён граней на протяжке", () => {
  it("переносит точку профиля вдоль прямого пути", () => {
    const spine = browserSweepSpine(profile(), path([line("l", 0, 0, 0, 10)]));
    const probes = pipeWorldProbes([{ key: "r.1", point: { x: 1, y: 0 } }], profile(), spine);
    expect(probes).toHaveLength(1);
    expectPoint(probes[0].start, [1, 0, 0]);
    expectPoint(probes[0].middle, [1, 0, 5]);
    expectPoint(probes[0].end, [1, 0, 10]);
  });

  it("поворачивает точку профиля вместе с касательной на дуге", () => {
    const spine = browserSweepSpine(profile(), path([line("l", 0, 0, 0, 10), bend]));
    const probes = pipeWorldProbes([{ key: "r.1", point: { x: 1, y: 0 } }], profile(), spine);
    expect(probes.map((probe) => probe.key)).toEqual(["r.1", "r.1"]);
    expectPoint(probes[0].middle, [1, 0, 5]);
    const inner = 10 - 9 * Math.SQRT1_2;
    expectPoint(probes[1].middle, [inner, 0, 10 + 9 * Math.SQRT1_2]);
    expectPoint(probes[1].end, [10, 0, 19]);
  });
});
