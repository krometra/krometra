import { describe, expect, it } from "vitest";
import type { SketchConstraint, SketchEntity } from "@/types/api";
import { SKETCH_ORIGIN_ID } from "@/sketcher/sketchOrigin";
import { INVALID } from "./params";
import { buildSketchConstraint, constraintAnchorsParam, updatedConstraintValue } from "./sketchConstraints";
import { ControlError } from "./protocol";

const entities: SketchEntity[] = [
  { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 30 } },
  { id: "l2", type: "line", start: { x: 20, y: 0 }, end: { x: 20, y: 30 } },
  { id: "c", type: "circle", center: { x: 50, y: 0 }, radius: 5 },
];

const anchors = constraintAnchorsParam("якоря");

function errorOf(run: () => unknown): ControlError {
  try {
    run();
  } catch (error) {
    if (error instanceof ControlError) return error;
    throw error;
  }
  throw new Error("ожидалась ошибка");
}

describe("constraintAnchorsParam", () => {
  it("читает якоря, point по умолчанию 0, origin — начало координат", () => {
    expect(anchors.read([{ entityId: "l1" }, { entityId: "origin", point: 0 }])).toEqual([
      { entityId: "l1", point: 0, whole: true },
      { entityId: SKETCH_ORIGIN_ID, point: 0 },
    ]);
  });

  it("отбрасывает пустые, лишние и кривые якоря", () => {
    expect(anchors.read([])).toBe(INVALID);
    expect(anchors.read([{ entityId: "a" }, { entityId: "b" }, { entityId: "c" }])).toBe(INVALID);
    expect(anchors.read([{ entityId: "" }])).toBe(INVALID);
    expect(anchors.read([{ entityId: "a", point: 1.5 }])).toBe(INVALID);
  });
});

describe("buildSketchConstraint", () => {
  it("расстояние между отрезками = 20", () => {
    expect(
      buildSketchConstraint({ type: "line_distance", anchors: [{ entityId: "l1", point: 0 }, { entityId: "l2", point: 0 }], value: 20 }, entities, "k"),
    ).toEqual({
      id: "k",
      type: "line_distance",
      anchors: [{ entity_id: "l1", sub_index: 0 }, { entity_id: "l2", sub_index: 0 }],
      value: 20,
    });
  });

  it("точка сохраняет номер, у отрезка в роли линии он сбрасывается", () => {
    const c = buildSketchConstraint(
      { type: "point_line_distance", anchors: [{ entityId: "l1", point: 1 }, { entityId: "l2", point: 1 }], value: 5 },
      entities,
      "k",
    );
    expect(c.anchors).toEqual([{ entity_id: "l1", sub_index: 1 }, { entity_id: "l2", sub_index: 0 }]);
  });

  it("угол хранит выбор луча", () => {
    const c = buildSketchConstraint({ type: "angle", anchors: [{ entityId: "l1", point: 0 }, { entityId: "l2", point: 1 }], value: 30 }, entities, "k");
    expect(c.anchors[1]).toEqual({ entity_id: "l2", sub_index: 1 });
  });

  it("начало координат и центр окружности как точки", () => {
    const c = buildSketchConstraint(
      { type: "horizontal_distance", anchors: [{ entityId: SKETCH_ORIGIN_ID, point: 0 }, { entityId: "c", point: 0 }], value: 50 },
      entities,
      "k",
    );
    expect(c.anchors.map((a) => a.entity_id)).toEqual([SKETCH_ORIGIN_ID, "c"]);
  });

  it("геометрическое без значения", () => {
    expect(buildSketchConstraint({ type: "parallel", anchors: [{ entityId: "l1", point: 0 }, { entityId: "l2", point: 0 }] }, entities, "k").value).toBeNull();
  });

  it("ошибки: число якорей, тип объекта, нет объекта, значение", () => {
    expect(errorOf(() => buildSketchConstraint({ type: "length", anchors: [{ entityId: "l1", point: 0 }, { entityId: "l2", point: 0 }], value: 3 }, entities, "k")).message).toMatch(/нужно якорей 1/);
    expect(errorOf(() => buildSketchConstraint({ type: "diameter", anchors: [{ entityId: "l1", point: 0 }], value: 3 }, entities, "k")).message).toMatch(/окружность или дуга/);
    expect(errorOf(() => buildSketchConstraint({ type: "length", anchors: [{ entityId: "zz", point: 0 }], value: 3 }, entities, "k")).code).toBe("not_found");
    expect(errorOf(() => buildSketchConstraint({ type: "length", anchors: [{ entityId: "l1", point: 0 }] }, entities, "k")).message).toMatch(/задайте value/);
    expect(errorOf(() => buildSketchConstraint({ type: "length", anchors: [{ entityId: "l1", point: 0 }], value: -1 }, entities, "k")).message).toMatch(/больше нуля/);
    expect(errorOf(() => buildSketchConstraint({ type: "vertical", anchors: [{ entityId: "l1", point: 0 }], value: 1 }, entities, "k")).message).toMatch(/не задаётся/);
    expect(errorOf(() => buildSketchConstraint({ type: "distance", anchors: [{ entityId: "l1", point: 2 }, { entityId: "l2", point: 0 }], value: 1 }, entities, "k")).code).toBe("invalid_params");
  });
});

describe("buildSketchConstraint: коллинеарность, середина, точка на кривой, фиксация", () => {
  const read = (value: unknown) => anchors.read(value) as Exclude<ReturnType<typeof anchors.read>, typeof INVALID>;

  it("collinear — два отрезка", () => {
    const c = buildSketchConstraint({ type: "collinear", anchors: read([{ entityId: "l1" }, { entityId: "l2" }]) }, entities, "k");
    expect(c).toEqual({ id: "k", type: "collinear", anchors: [{ entity_id: "l1", sub_index: 0 }, { entity_id: "l2", sub_index: 0 }], value: null });
    expect(errorOf(() => buildSketchConstraint({ type: "collinear", anchors: read([{ entityId: "l1" }, { entityId: "c" }]) }, entities, "k")).message).toMatch(/отрезок/);
  });

  it("midpoint — явная точка и отрезок, центр окружности или начало координат", () => {
    const end = buildSketchConstraint({ type: "midpoint", anchors: read([{ entityId: "l2", point: 1 }, { entityId: "l1" }]) }, entities, "k");
    expect(end.anchors).toEqual([{ entity_id: "l2", sub_index: 1 }, { entity_id: "l1", sub_index: 0 }]);
    const origin = buildSketchConstraint({ type: "midpoint", anchors: read([{ entityId: "origin" }, { entityId: "l1" }]) }, entities, "k");
    expect(origin.anchors[0]).toEqual({ entity_id: SKETCH_ORIGIN_ID, sub_index: 0 });
    expect(errorOf(() => buildSketchConstraint({ type: "midpoint", anchors: read([{ entityId: "l1" }, { entityId: "c" }]) }, entities, "k")).message).toMatch(/якорь 2/);
  });

  it("point_on_curve — точка на отрезке, окружности или дуге", () => {
    const onCircle = buildSketchConstraint({ type: "point_on_curve", anchors: read([{ entityId: "l1", point: 1 }, { entityId: "c" }]) }, entities, "k");
    expect(onCircle.anchors).toEqual([{ entity_id: "l1", sub_index: 1 }, { entity_id: "c", sub_index: 0 }]);
    const onLine = buildSketchConstraint({ type: "point_on_curve", anchors: read([{ entityId: "c", point: 0 }, { entityId: "l2" }]) }, entities, "k");
    expect(onLine.anchors).toEqual([{ entity_id: "c", sub_index: 0 }, { entity_id: "l2", sub_index: 0 }]);
    expect(errorOf(() => buildSketchConstraint({ type: "point_on_curve", anchors: read([{ entityId: "l1" }, { entityId: "origin" }]) }, entities, "k")).message).toMatch(/кривая|отрезок, окружность или дуга/);
  });

  it("fix — без point объект целиком, с point только точка", () => {
    const whole = buildSketchConstraint({ type: "fix", anchors: read([{ entityId: "c" }]) }, entities, "k");
    expect(whole.anchors).toEqual([{ entity_id: "c", sub_index: -1 }]);
    const point = buildSketchConstraint({ type: "fix", anchors: read([{ entityId: "l1", point: 0 }]) }, entities, "k");
    expect(point.anchors).toEqual([{ entity_id: "l1", sub_index: 0 }]);
    expect(errorOf(() => buildSketchConstraint({ type: "fix", anchors: read([{ entityId: "l1" }]), value: 1 }, entities, "k")).message).toMatch(/не задаётся/);
  });
});

describe("updatedConstraintValue", () => {
  const constraints: SketchConstraint[] = [
    { id: "d", type: "line_distance", anchors: [], value: 20 },
    { id: "p", type: "parallel", anchors: [], value: null },
  ];

  it("меняет только нужный размер", () => {
    expect(updatedConstraintValue(constraints, "d", 30)).toEqual([{ ...constraints[0], value: 30 }, constraints[1]]);
  });

  it("не трогает геометрические и неизвестные", () => {
    expect(errorOf(() => updatedConstraintValue(constraints, "p", 3)).message).toMatch(/не размер/);
    expect(errorOf(() => updatedConstraintValue(constraints, "x", 3)).code).toBe("not_found");
  });
});
