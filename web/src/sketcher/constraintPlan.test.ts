import { describe, expect, it } from "vitest";
import type { ConstraintType, SketchEntity } from "@/types/api";
import { constraintBlocker, planConstraints, toolbarDimension, type ConstraintPick } from "./constraintPlan";
import { targetOfEntity, targetOfSelection } from "./dimensionTargets";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN_ID } from "./sketchOrigin";
import { LINE_MIDPOINT } from "./sketchPoints";

const line = (id: string): SketchEntity => ({ id, type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 1 } });
const circle = (id: string): SketchEntity => ({ id, type: "circle", center: { x: 0, y: 5 }, radius: 5 });
const arc = (id: string): SketchEntity => ({
  id, type: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: 1,
});
const infline = (id: string): SketchEntity => ({ id, type: "infline", point: { x: 0, y: 3 }, angle: 0 });

const picks = (...entities: SketchEntity[]): ConstraintPick[] => entities.map((entity) => targetOfEntity(entity)!);

const sceneLines = [line("a"), line("b"), line("c")];
const point = (entityId: string, subIndex: number): ConstraintPick =>
  targetOfSelection({ kind: "point", entityId, subIndex }, sceneLines)!;
const origin = targetOfSelection({ kind: "origin" }, [])!;
const axisX = targetOfSelection({ kind: "axis", axis: "x" }, [])!;

function plan(type: ConstraintType, selection: ConstraintPick[]) {
  let counter = 0;
  return planConstraints(type, selection, () => `c${++counter}`);
}

const ids = (constraints: ReturnType<typeof plan>) =>
  constraints.map((c) => c.anchors.map((a) => a.entity_id));

describe("constraintBlocker", () => {
  it("equal: N отрезков или N окружностей и дуг, но не вперемешку и не бесконечные прямые", () => {
    expect(constraintBlocker("equal", picks(line("a"), line("b"), line("c")))).toBeNull();
    expect(constraintBlocker("equal", picks(circle("a"), arc("b"), circle("c")))).toBeNull();
    expect(constraintBlocker("equal", picks(line("a"), circle("b"), line("c")))).toMatch(/только отрезки или/);
    expect(constraintBlocker("equal", picks(line("a"), infline("k")))).toMatch(/только отрезки или/);
    expect(constraintBlocker("equal", picks(line("a")))).toMatch(/два объекта/);
  });

  it("horizontal и vertical: любое число отрезков и прямых или ровно две точки", () => {
    expect(constraintBlocker("horizontal", picks(line("a")))).toBeNull();
    expect(constraintBlocker("vertical", picks(line("a"), line("b"), infline("k")))).toBeNull();
    expect(constraintBlocker("horizontal", picks(line("a"), circle("b")))).toBe("только отрезки или две точки");
    expect(constraintBlocker("horizontal", [point("a", 1), point("b", 0)])).toBeNull();
    expect(constraintBlocker("vertical", [point("a", LINE_MIDPOINT), origin])).toBeNull();
    expect(constraintBlocker("vertical", [point("a", 1), point("a", 1)])).toBe("это та же точка");
    expect(constraintBlocker("horizontal", [point("a", 1), point("b", 0), point("c", 0)])).toBe("только отрезки или две точки");
    expect(constraintBlocker("horizontal", [point("a", 1), targetOfEntity(line("b"))!])).toBe("только отрезки или две точки");
  });

  it("coincident: только точки, две и больше, в том числе начало координат", () => {
    expect(constraintBlocker("coincident", [point("a", 0), point("b", 1), origin])).toBeNull();
    expect(constraintBlocker("coincident", [point("a", 0)])).toMatch(/два объекта/);
    expect(constraintBlocker("coincident", picks(line("a"), circle("b")))).toMatch(/только точки/);
  });

  it("parallel и perpendicular принимают оси и вспомогательные прямые", () => {
    expect(constraintBlocker("parallel", picks(line("a"), line("b"), line("c")))).toBeNull();
    expect(constraintBlocker("parallel", [targetOfEntity(line("a"))!, axisX])).toBeNull();
    expect(constraintBlocker("perpendicular", [targetOfEntity(infline("k"))!, targetOfEntity(line("a"))!])).toBeNull();
    expect(constraintBlocker("parallel", picks(line("a"), circle("b")))).toBe("только отрезки и прямые");
  });

  it("perpendicular, angle и distance для трёх объектов не определены", () => {
    const three = picks(line("a"), line("b"), line("c"));
    expect(constraintBlocker("perpendicular", three)).toBe("только для двух отрезков, выбрано 3");
    expect(constraintBlocker("angle", three)).toBe("только для двух отрезков, выбрано 3");
    expect(constraintBlocker("distance", three)).toBe("только для одного или двух объектов, выбрано 3");
    expect(constraintBlocker("perpendicular", picks(line("a"), line("b")))).toBeNull();
    expect(constraintBlocker("distance", picks(line("a"), circle("b")))).toBeNull();
  });

  it("radius: ровно одна окружность или дуга", () => {
    expect(constraintBlocker("radius", picks(arc("a")))).toBeNull();
    expect(constraintBlocker("radius", picks(circle("a"), circle("b")))).toBe("только для одного объекта, выбрано 2");
    expect(constraintBlocker("radius", picks(line("a")))).toBe("нужна окружность или дуга");
  });

  it("без выделения ничего не применяется", () => {
    expect(constraintBlocker("horizontal", [])).toBe("ничего не выбрано");
  });
});

describe("planConstraints", () => {
  it("equal для трёх отрезков — цепочка из двух равенств", () => {
    expect(ids(plan("equal", picks(line("a"), line("b"), line("c"))))).toEqual([["a", "b"], ["b", "c"]]);
  });

  it("horizontal для трёх отрезков — по ограничению на каждый", () => {
    const constraints = plan("horizontal", picks(line("a"), line("b"), line("c")));
    expect(ids(constraints)).toEqual([["a"], ["b"], ["c"]]);
    expect(constraints.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(constraints.every((c) => c.type === "horizontal" && c.value === null)).toBe(true);
  });

  it("horizontal двух точек — одно ограничение с номерами точек", () => {
    const [constraint, ...rest] = plan("horizontal", [point("a", 1), point("b", LINE_MIDPOINT)]);
    expect(rest).toHaveLength(0);
    expect(constraint.anchors).toEqual([
      { entity_id: "a", sub_index: 1 },
      { entity_id: "b", sub_index: LINE_MIDPOINT },
    ]);
  });

  it("coincident для N точек — цепочка, сохраняющая номер точки", () => {
    const constraints = plan("coincident", [point("a", 0), point("b", 1), point("c", LINE_MIDPOINT), origin]);
    expect(ids(constraints)).toEqual([["a", "b"], ["b", "c"], ["c", SKETCH_ORIGIN_ID]]);
    expect(constraints[0].anchors[1]).toEqual({ entity_id: "b", sub_index: 1 });
    expect(constraints[1].anchors[1]).toEqual({ entity_id: "c", sub_index: LINE_MIDPOINT });
  });

  it("parallel отрезка и оси ссылается на ось", () => {
    expect(ids(plan("parallel", [targetOfEntity(line("a"))!, axisX]))).toEqual([["a", SKETCH_AXIS_IDS.x]]);
  });

  it("парное ограничение двух объектов — одно, как раньше", () => {
    expect(ids(plan("perpendicular", picks(line("a"), line("b"))))).toEqual([["a", "b"]]);
    expect(ids(plan("equal", picks(circle("a"), circle("b"))))).toEqual([["a", "b"]]);
  });

  it("якоря не делят объекты с выделением", () => {
    const selection = picks(line("a"), line("b"));
    const [constraint] = plan("parallel", selection);
    constraint.anchors[0].sub_index = 7;
    expect(selection[0].ref.sub_index).toBe(0);
  });
});

describe("toolbarDimension", () => {
  it("середина отрезка и начало координат дают размер между точками", () => {
    const draft = toolbarDimension("distance", [point("a", LINE_MIDPOINT), origin]);
    expect(draft?.anchors).toEqual([{ entity_id: "a", sub_index: LINE_MIDPOINT }, { entity_id: SKETCH_ORIGIN_ID, sub_index: 0 }]);
    expect(draft?.value).toBeCloseTo(Math.hypot(5, 0.5));
  });

  it("точка и ось дают перпендикулярное расстояние до оси", () => {
    const draft = toolbarDimension("distance", [point("a", 1), axisX]);
    expect(draft).toEqual({ type: "point_line_distance", anchors: [{ entity_id: "a", sub_index: 1 }, { entity_id: SKETCH_AXIS_IDS.x, sub_index: 0 }], value: 1 });
  });
});
