import { describe, expect, it } from "vitest";
import type { ConstraintType, SketchEntity } from "@/types/api";
import { constraintBlocker, planConstraints, type ConstraintPick } from "./constraintPlan";

const line = (id: string): SketchEntity => ({ id, type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 1 } });
const circle = (id: string): SketchEntity => ({ id, type: "circle", center: { x: 0, y: 0 }, radius: 5 });
const arc = (id: string): SketchEntity => ({
  id, type: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: 1,
});

const picks = (...entities: SketchEntity[]): ConstraintPick[] =>
  entities.map((entity) => ({ entity, ref: { entity_id: entity.id, sub_index: 0 } }));

function plan(type: ConstraintType, selection: ConstraintPick[]) {
  let counter = 0;
  return planConstraints(type, selection, () => `c${++counter}`);
}

const ids = (constraints: ReturnType<typeof plan>) =>
  constraints.map((c) => c.anchors.map((a) => a.entity_id));

describe("constraintBlocker", () => {
  it("equal: N отрезков или N окружностей и дуг, но не вперемешку", () => {
    expect(constraintBlocker("equal", picks(line("a"), line("b"), line("c")))).toBeNull();
    expect(constraintBlocker("equal", picks(circle("a"), arc("b"), circle("c")))).toBeNull();
    expect(constraintBlocker("equal", picks(line("a"), circle("b"), line("c")))).toMatch(/только отрезки или/);
    expect(constraintBlocker("equal", picks(line("a")))).toMatch(/два объекта/);
  });

  it("horizontal и vertical: любое число отрезков, без окружностей", () => {
    expect(constraintBlocker("horizontal", picks(line("a")))).toBeNull();
    expect(constraintBlocker("vertical", picks(line("a"), line("b"), line("c")))).toBeNull();
    expect(constraintBlocker("horizontal", picks(line("a"), circle("b")))).toBe("только отрезки");
  });

  it("coincident и parallel: два объекта и больше", () => {
    expect(constraintBlocker("coincident", picks(line("a"), circle("b"), arc("c")))).toBeNull();
    expect(constraintBlocker("coincident", picks(line("a")))).not.toBeNull();
    expect(constraintBlocker("parallel", picks(line("a"), line("b"), line("c")))).toBeNull();
    expect(constraintBlocker("parallel", picks(line("a"), circle("b")))).toBe("только отрезки");
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

  it("coincident для N точек — цепочка, сохраняющая номер точки", () => {
    const selection = picks(line("a"), line("b"), circle("c"), arc("d"));
    selection[1].ref.sub_index = 1;
    const constraints = plan("coincident", selection);
    expect(ids(constraints)).toEqual([["a", "b"], ["b", "c"], ["c", "d"]]);
    expect(constraints[0].anchors[1]).toEqual({ entity_id: "b", sub_index: 1 });
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
