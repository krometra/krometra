import { describe, expect, it } from "vitest";
import type { SketchEntity } from "@/types/api";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN_ID } from "@/sketcher/sketchOrigin";
import { INVALID } from "./params";
import { ControlError } from "./protocol";
import { describeSelection, selectionConstraints, selectionTargets, sketchSelectionParam } from "./sketchSelection";

const entities: SketchEntity[] = [
  { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 30 } },
  { id: "l2", type: "line", start: { x: 20, y: 4 }, end: { x: 20, y: 30 } },
  { id: "face-edge-1-1", type: "line", start: { x: -50, y: -10 }, end: { x: 50, y: -10 }, construction: true },
];

const param = sketchSelectionParam("выделение");

function errorOf(run: () => unknown): ControlError {
  try {
    run();
  } catch (error) {
    if (error instanceof ControlError) return error;
    throw error;
  }
  throw new Error("ожидалась ошибка");
}

let counter = 0;
const nextId = () => `k${++counter}`;

describe("sketchSelectionParam", () => {
  it("объект без point, точка с point, начало координат и оси по псевдонимам", () => {
    expect(param.read([{ entityId: "l1" }, { entityId: "l2", point: 2 }, { entityId: "origin" }, { entityId: "axis-y" }])).toEqual([
      { kind: "entity", entityId: "l1" },
      { kind: "point", entityId: "l2", subIndex: 2 },
      { kind: "origin" },
      { kind: "axis", axis: "y" },
    ]);
    expect(param.read([])).toEqual([]);
  });

  it("отбрасывает кривые элементы", () => {
    expect(param.read([{ entityId: "" }])).toBe(INVALID);
    expect(param.read([{ entityId: "l1", point: 9 }])).toBe(INVALID);
    expect(param.read("l1")).toBe(INVALID);
  });
});

describe("selectionTargets и describeSelection", () => {
  it("несуществующий объект — not_found, несуществующая точка — invalid_params", () => {
    expect(errorOf(() => selectionTargets([{ kind: "entity", entityId: "zz" }], entities)).code).toBe("not_found");
    expect(errorOf(() => selectionTargets([{ kind: "point", entityId: "l1", subIndex: 3 }], entities)).code).toBe("invalid_params");
  });

  it("описание выделения содержит координаты и подписи точек", () => {
    expect(describeSelection([{ kind: "point", entityId: "l1", subIndex: 2 }, { kind: "axis", axis: "x" }], entities)).toEqual([
      { kind: "point", entityId: "l1", point: 2, at: { x: 0, y: 15 }, label: "Середина", },
      { kind: "axis", entityId: SKETCH_AXIS_IDS.x, point: undefined, at: undefined, label: undefined },
    ]);
  });
});

describe("selectionConstraints", () => {
  it("совпадение середины отрезка и начала координат", () => {
    const targets = selectionTargets([{ kind: "point", entityId: "l2", subIndex: 2 }, { kind: "origin" }], entities);
    const [constraint] = selectionConstraints({ type: "coincident", targets }, nextId);
    expect(constraint.anchors).toEqual([{ entity_id: "l2", sub_index: 2 }, { entity_id: SKETCH_ORIGIN_ID, sub_index: 0 }]);
    expect(constraint.value).toBeNull();
  });

  it("размер от ребра грани: значение по умолчанию — текущее, можно задать своё", () => {
    const targets = selectionTargets([{ kind: "entity", entityId: "face-edge-1-1" }, { kind: "point", entityId: "l2", subIndex: 0 }], entities);
    expect(selectionConstraints({ type: "distance", targets }, nextId)[0]).toMatchObject({
      type: "point_line_distance",
      anchors: [{ entity_id: "l2", sub_index: 0 }, { entity_id: "face-edge-1-1", sub_index: 0 }],
      value: 14,
    });
    expect(selectionConstraints({ type: "distance", targets, value: 10 }, nextId)[0].value).toBe(10);
    expect(errorOf(() => selectionConstraints({ type: "distance", targets, value: -1 }, nextId)).code).toBe("invalid_params");
  });

  it("недоступное ограничение объясняет причину, геометрическое не принимает value", () => {
    const lines = selectionTargets([{ kind: "entity", entityId: "l1" }, { kind: "entity", entityId: "l2" }], entities);
    expect(errorOf(() => selectionConstraints({ type: "coincident", targets: lines }, nextId)).message).toMatch(/только точки/);
    expect(errorOf(() => selectionConstraints({ type: "parallel", targets: lines, value: 3 }, nextId)).message).toMatch(/value не задаётся/);
  });
});
