import { describe, expect, it } from "vitest";
import type { SketchEntity } from "@/types/api";
import {
  computeWorkPlaneFrame,
  definitionBodies,
  definitionSketches,
  framedPlane,
  placementOfFrame,
  pointOf,
  sketchPointLocal,
  WorkPlaneError,
  type WorkPlaneDefinition,
  type WorkPlaneGeometry,
} from "./workPlane";

type V = [number, number, number];

const closeTo = (values: number[]) => values.map((value) => expect.closeTo(value, 9));

const line: SketchEntity = { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
const arc: SketchEntity = { id: "a1", type: "arc", center: { x: 1, y: 1 }, radius: 2, startAngle: 0, endAngle: Math.PI / 2 };

function geometry(overrides: Partial<WorkPlaneGeometry> = {}): WorkPlaneGeometry {
  const faces: Record<string, { point: V; normal: V }> = {
    top: { point: [5, 5, 10], normal: [0, 0, 1] },
    bottom: { point: [2, 3, 0], normal: [0, 0, -1] },
    side: { point: [20, 5, 5], normal: [1, 0, 0] },
    slanted: { point: [0, 0, 0], normal: [0, Math.SQRT1_2, Math.SQRT1_2] },
  };
  const edges: Record<string, { start: V; end: V; straight: boolean }> = {
    ex: { start: [0, 0, 10], end: [20, 0, 10], straight: true },
    exBack: { start: [20, 0, 10], end: [0, 0, 10], straight: true },
    ez: { start: [0, 0, 0], end: [0, 0, 10], straight: true },
    ey: { start: [0, 0, 10], end: [0, 10, 10], straight: true },
    eyTop: { start: [0, 10, 10], end: [5, 10, 10], straight: true },
    arc: { start: [0, 0, 0], end: [1, 1, 0], straight: false },
  };
  return {
    face: (ref) => faces[ref.faceName],
    edge: (ref) => edges[ref.edgeName],
    sketch: () => ({
      entities: [line, arc],
      placement: { plane: "XZ", planeOffset: 5, planeBasis: null },
    }),
    ...overrides,
  };
}

const frame = (definition: WorkPlaneDefinition, source = geometry()) => computeWorkPlaneFrame(definition, source);

describe("смещённая рабочая плоскость", () => {
  it("сдвигает базовую плоскость вдоль её нормали", () => {
    const result = frame({ kind: "offset", reference: { kind: "base", plane: "XZ" }, distance: 7 });
    expect(result).toEqual({ origin: [0, 7, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] });
  });

  it("отрицательное смещение — в другую сторону", () => {
    expect(frame({ kind: "offset", reference: { kind: "base", plane: "YZ" }, distance: -3 }).origin).toEqual([-3, 0, 0]);
  });

  it("от грани откладывает по её наружной нормали", () => {
    const result = frame({ kind: "offset", reference: { kind: "face", bodyId: "b", faceName: "top" }, distance: 4 });
    expect(result.origin).toEqual([0, 0, 14]);
    expect(result.n).toEqual([0, 0, 1]);
    const bottom = frame({ kind: "offset", reference: { kind: "face", bodyId: "b", faceName: "bottom" }, distance: 4 });
    expect(bottom.origin).toEqual([0, 0, -4]);
    expect(bottom.n).toEqual([0, 0, -1]);
  });

  it("строит правый базис для наклонной грани", () => {
    const result = frame({ kind: "offset", reference: { kind: "face", bodyId: "b", faceName: "slanted" }, distance: Math.SQRT2 });
    expect(result.origin).toEqual(closeTo([0, 1, 1]));
    const handed = [
      result.u[1] * result.v[2] - result.u[2] * result.v[1],
      result.u[2] * result.v[0] - result.u[0] * result.v[2],
      result.u[0] * result.v[1] - result.u[1] * result.v[0],
    ];
    expect(handed).toEqual(closeTo(result.n));
  });

  it("от плоскости эскиза", () => {
    const result = frame({ kind: "offset", reference: { kind: "sketch", sketchId: "s" }, distance: 1 });
    expect(result.origin).toEqual([0, 6, 0]);
  });
});

describe("плоскость под углом", () => {
  it("через ребро под 90° к XY — вертикальная плоскость через ребро", () => {
    const result = frame({ kind: "angle", axis: { kind: "edge", bodyId: "b", edgeName: "ex" }, reference: { kind: "base", plane: "XY" }, angle: 90 });
    expect(result.origin).toEqual([10, 0, 10]);
    expect(result.u).toEqual([1, 0, 0]);
    expect(result.n).toEqual(closeTo([0, -1, 0]));
  });

  it("под 0° параллельна опорной и проходит через ось", () => {
    const result = frame({ kind: "angle", axis: { kind: "edge", bodyId: "b", edgeName: "ex" }, reference: { kind: "base", plane: "XY" }, angle: 0 });
    expect(result.n).toEqual(closeTo([0, 0, 1]));
    expect(result.origin[2]).toBe(10);
  });

  it("не зависит от направления ребра", () => {
    const forward = frame({ kind: "angle", axis: { kind: "edge", bodyId: "b", edgeName: "ex" }, reference: { kind: "base", plane: "XY" }, angle: 30 });
    const backward = frame({ kind: "angle", axis: { kind: "edge", bodyId: "b", edgeName: "exBack" }, reference: { kind: "base", plane: "XY" }, angle: 30 });
    expect(backward).toEqual(forward);
    expect(forward.n).toEqual(closeTo([0, -0.5, Math.sqrt(3) / 2]));
  });

  it("через отрезок эскиза: ось — в мировых координатах эскиза", () => {
    const result = frame({ kind: "angle", axis: { kind: "sketch_line", sketchId: "s", entityId: "l1" }, reference: { kind: "sketch", sketchId: "s" }, angle: 90 });
    expect(result.origin).toEqual([5, 5, 0]);
    expect(Math.abs(result.n[2])).toBeCloseTo(1, 9);
  });

  it("отказывает, если ось перпендикулярна опоре, ребро кривое или выбран не отрезок", () => {
    expect(() => frame({ kind: "angle", axis: { kind: "edge", bodyId: "b", edgeName: "ez" }, reference: { kind: "base", plane: "XY" }, angle: 45 }))
      .toThrow(/перпендикулярна/);
    expect(() => frame({ kind: "angle", axis: { kind: "edge", bodyId: "b", edgeName: "arc" }, reference: { kind: "base", plane: "XY" }, angle: 45 }))
      .toThrow(/не прямое/);
    expect(() => frame({ kind: "angle", axis: { kind: "sketch_line", sketchId: "s", entityId: "a1" }, reference: { kind: "base", plane: "XY" }, angle: 45 }))
      .toThrow(WorkPlaneError);
  });
});

describe("плоскость по трём точкам и средняя", () => {
  it("по трём вершинам: нормаль по правилу правой руки, начало в центре", () => {
    const result = frame({
      kind: "three_points",
      points: [
        { kind: "vertex", bodyId: "b", edgeName: "ex", adjacentEdgeName: "ey" },
        { kind: "vertex", bodyId: "b", edgeName: "exBack", adjacentEdgeName: "exBack" },
        { kind: "vertex", bodyId: "b", edgeName: "ey", adjacentEdgeName: "eyTop" },
      ],
    });
    expect(result.n).toEqual([0, 0, 1]);
    expect(result.origin).toEqual(closeTo([20 / 3, 10 / 3, 10]));
    expect(result.u).toEqual([1, 0, 0]);
  });

  it("вершина — общий конец двух рёбер, а не начало ребра", () => {
    expect(pointOf({ kind: "vertex", bodyId: "b", edgeName: "exBack", adjacentEdgeName: "ey" }, geometry())).toEqual([0, 0, 10]);
  });

  it("точки эскиза: конец отрезка и центр дуги", () => {
    expect(pointOf({ kind: "sketch_point", sketchId: "s", entityId: "l1", subIndex: 1 }, geometry())).toEqual([10, 5, 0]);
    expect(pointOf({ kind: "sketch_point", sketchId: "s", entityId: "a1", subIndex: 0 }, geometry())).toEqual([1, 5, 1]);
    expect(sketchPointLocal(arc, 2)).toEqual({ x: expect.closeTo(1, 9), y: 3 });
  });

  it("отказывает на трёх точках одной прямой", () => {
    expect(() => frame({
      kind: "three_points",
      points: [
        { kind: "sketch_point", sketchId: "s", entityId: "l1", subIndex: 0 },
        { kind: "sketch_point", sketchId: "s", entityId: "l1", subIndex: 1 },
        { kind: "sketch_point", sketchId: "s", entityId: "l1", subIndex: 0 },
      ],
    })).toThrow(/одной прямой/);
  });

  it("средняя плоскость между противоположными гранями", () => {
    const result = frame({ kind: "midplane", faces: [{ bodyId: "b", faceName: "top" }, { bodyId: "b", faceName: "bottom" }] });
    expect(result.origin).toEqual([0, 0, 5]);
    expect(result.n).toEqual([0, 0, 1]);
    expect(() => frame({ kind: "midplane", faces: [{ bodyId: "b", faceName: "top" }, { bodyId: "b", faceName: "side" }] })).toThrow(/не параллельны/);
  });
});

describe("служебное", () => {
  it("выровненная плоскость получает имя базовой и смещение", () => {
    const placement = placementOfFrame(framedPlane([3, 4, 12], [0, 0, 1]));
    expect(placement.plane).toBe("XY");
    expect(placement.planeOffset).toBe(12);
    expect(placement.planeBasis?.origin).toEqual([0, 0, 12]);
  });

  it("собирает тела и эскизы опор", () => {
    const definition: WorkPlaneDefinition = { kind: "angle", axis: { kind: "edge", bodyId: "b1", edgeName: "e" }, reference: { kind: "sketch", sketchId: "s1" }, angle: 10 };
    expect(definitionBodies(definition)).toEqual(["b1"]);
    expect(definitionSketches(definition)).toEqual(["s1"]);
  });
});
