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

const pointPick = (entity: SketchEntity, subIndex: number): ConstraintPick => ({
  entity,
  ref: { entity_id: entity.id, sub_index: subIndex },
  point: true,
});

const anchors = (constraints: ReturnType<typeof plan>) => constraints.map((c) => c.anchors);

describe("collinear", () => {
  it("два отрезка и больше, цепочкой", () => {
    expect(constraintBlocker("collinear", picks(line("a"), line("b")))).toBeNull();
    expect(constraintBlocker("collinear", picks(line("a")))).toMatch(/два объекта/);
    expect(constraintBlocker("collinear", picks(line("a"), circle("b")))).toBe("только отрезки");
    expect(constraintBlocker("collinear", [pointPick(line("a"), 1), ...picks(line("b"))])).toBe("только отрезки");
    expect(ids(plan("collinear", picks(line("a"), line("b"), line("c"))))).toEqual([["a", "b"], ["b", "c"]]);
  });
});

describe("midpoint", () => {
  it("отрезок и окружность в любом порядке: центр окружности в середине отрезка", () => {
    const expected = [[{ entity_id: "c", sub_index: 0 }, { entity_id: "a", sub_index: 0 }]];
    expect(constraintBlocker("midpoint", picks(line("a"), circle("c")))).toBeNull();
    expect(anchors(plan("midpoint", picks(line("a"), circle("c"))))).toEqual(expected);
    expect(anchors(plan("midpoint", picks(circle("c"), line("a"))))).toEqual(expected);
  });

  it("точка и отрезок: выбранная точка, порядок не важен", () => {
    const expected = [[{ entity_id: "b", sub_index: 1 }, { entity_id: "a", sub_index: 0 }]];
    expect(anchors(plan("midpoint", [pointPick(line("b"), 1), ...picks(line("a"))]))).toEqual(expected);
    expect(anchors(plan("midpoint", [...picks(line("a")), pointPick(line("b"), 1)]))).toEqual(expected);
  });

  it("два отрезка: начало первого в середине второго", () => {
    expect(anchors(plan("midpoint", picks(line("a"), line("b"))))).toEqual([
      [{ entity_id: "a", sub_index: 0 }, { entity_id: "b", sub_index: 0 }],
    ]);
  });

  it("без отрезка, с одним объектом или с точкой своего же отрезка недоступно", () => {
    expect(constraintBlocker("midpoint", picks(circle("a"), arc("b")))).toBe("нужен отрезок");
    expect(constraintBlocker("midpoint", picks(line("a")))).toBe("только для точки и отрезка, выбрано 1");
    expect(constraintBlocker("midpoint", [pointPick(line("a"), 1), ...picks(line("a"))])).toMatch(/разными объектами/);
  });
});

describe("point_on_curve", () => {
  it("окружность и отрезок: центр на прямой", () => {
    expect(constraintBlocker("point_on_curve", picks(circle("c"), line("a")))).toBeNull();
    expect(anchors(plan("point_on_curve", picks(circle("c"), line("a"))))).toEqual([
      [{ entity_id: "c", sub_index: 0 }, { entity_id: "a", sub_index: 0 }],
    ]);
  });

  it("отрезок и окружность: начало отрезка на окружности, как coincident по объектам", () => {
    expect(anchors(plan("point_on_curve", picks(line("a"), arc("r"))))).toEqual([
      [{ entity_id: "a", sub_index: 0 }, { entity_id: "r", sub_index: 0 }],
    ]);
  });

  it("выбранная точка на кривой", () => {
    expect(anchors(plan("point_on_curve", [pointPick(arc("r"), 2), ...picks(line("a"))]))).toEqual([
      [{ entity_id: "r", sub_index: 2 }, { entity_id: "a", sub_index: 0 }],
    ]);
  });

  it("вторым должна быть кривая другого объекта", () => {
    expect(constraintBlocker("point_on_curve", [...picks(line("a")), pointPick(line("b"), 0)])).toMatch(/второй нужна кривая/);
    expect(constraintBlocker("point_on_curve", [pointPick(line("a"), 1), ...picks(line("a"))])).toMatch(/разными объектами/);
    expect(constraintBlocker("point_on_curve", picks(line("a"), line("b"), line("c")))).toBe("только для точки и кривой, выбрано 3");
  });
});

describe("fix", () => {
  it("объект целиком или выбранная точка, по ограничению на каждый", () => {
    const selection = [...picks(line("a"), circle("c")), pointPick(arc("r"), 1)];
    expect(constraintBlocker("fix", selection)).toBeNull();
    expect(anchors(plan("fix", selection))).toEqual([
      [{ entity_id: "a", sub_index: -1 }],
      [{ entity_id: "c", sub_index: -1 }],
      [{ entity_id: "r", sub_index: 1 }],
    ]);
  });

  it("прямоугольник старого формата не закрепляется", () => {
    const rect: SketchEntity = { id: "q", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 1, y: 1 } };
    expect(constraintBlocker("fix", picks(rect))).toMatch(/закрепляются/);
  });
});
