import { describe, expect, it } from "vitest";
import type { ConstraintType, SketchConstraint, SketchEntity } from "@/types/api";
import { dimensionLayouts, findDimensionLabelAt } from "./dimensionLayout";
import { SKETCH_ORIGIN_ID } from "./sketchOrigin";

const entities: SketchEntity[] = [
  { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
  { id: "b", type: "line", start: { x: 0, y: 20 }, end: { x: 40, y: 20 } },
  { id: "v", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 30 } },
  { id: "c", type: "circle", center: { x: 100, y: 0 }, radius: 10 },
];

const at = (entity_id: string, sub_index = 0) => ({ entity_id, sub_index });
const dim = (type: ConstraintType, anchors: ReturnType<typeof at>[], value: number | null): SketchConstraint => ({
  id: `${type}-1`,
  type,
  anchors,
  value,
});

const layoutOf = (c: SketchConstraint, unit = 0.1) => dimensionLayouts([c], entities, unit)[0];

describe("dimensionLayouts", () => {
  it("длина: подпись над серединой отрезка, сдвинута по нормали", () => {
    const layout = layoutOf(dim("length", [at("a")], 40));
    expect(layout.text).toBe("40");
    expect(layout.label.x).toBeCloseTo(20, 6);
    expect(layout.label.y).toBeCloseTo(1.6, 6);
    expect(layout.segments).toHaveLength(3);
  });

  it("расстояние между параллельными: от середины базового отрезка до второго", () => {
    const layout = layoutOf(dim("line_distance", [at("a"), at("b")], 20));
    expect(layout.segments).toEqual([[{ x: 20, y: 0 }, { x: 20, y: 20 }]]);
    expect(layout.label).toEqual({ x: 20, y: 10 });
  });

  it("от начала координат до линии: перпендикуляр", () => {
    const layout = layoutOf(dim("point_line_distance", [at(SKETCH_ORIGIN_ID), at("b")], 20));
    expect(layout.segments[0][0]).toEqual({ x: 0, y: 0 });
    expect(layout.segments[0][1].x).toBeCloseTo(0, 9);
    expect(layout.segments[0][1].y).toBeCloseTo(20, 9);
  });

  it("горизонтальный и вертикальный размеры выносятся за точки", () => {
    const h = layoutOf(dim("horizontal_distance", [at("a", 0), at("b", 1)], 40));
    expect(h.label).toEqual({ x: 20, y: 21.6 });
    const v = layoutOf(dim("vertical_distance", [at("a", 1), at("b", 1)], 20));
    expect(v.label).toEqual({ x: 41.6, y: 10 });
  });

  it("диаметр и радиус подписаны знаками", () => {
    expect(layoutOf(dim("diameter", [at("c")], 20)).text).toBe("⌀20");
    expect(layoutOf(dim("radius", [at("c")], 10)).text).toBe("R10");
  });

  it("угол: дуга между лучами от точки пересечения", () => {
    const layout = layoutOf(dim("angle", [at("a"), at("v")], 90));
    expect(layout.text).toBe("90°");
    expect(layout.arc).toMatchObject({ center: { x: 0, y: 0 }, from: 0 });
    expect(layout.arc!.to).toBeCloseTo(Math.PI / 2, 9);
  });

  it("старое расстояние между точками рисуется между ними", () => {
    expect(layoutOf(dim("distance", [at("a", 1), at("b", 1)], 20)).segments).toEqual([[{ x: 40, y: 0 }, { x: 40, y: 20 }]]);
  });

  it("геометрические ограничения и битые ссылки подписей не дают", () => {
    expect(dimensionLayouts([dim("parallel", [at("a"), at("b")], null)], entities, 1)).toEqual([]);
    expect(dimensionLayouts([dim("length", [at("gone")], 5)], entities, 1)).toEqual([]);
  });

  it("значение без числа показывается вопросом", () => {
    expect(layoutOf(dim("length", [at("a")], null)).text).toBe("?");
  });
});

describe("findDimensionLabelAt", () => {
  const constraints = [dim("length", [at("a")], 40), { ...dim("line_distance", [at("a"), at("b")], 20), id: "gap" }];

  it("попадание в подпись возвращает её ограничение", () => {
    expect(findDimensionLabelAt(constraints, entities, { x: 20, y: 10.5 }, 0.1)).toBe("gap");
    expect(findDimensionLabelAt(constraints, entities, { x: 21, y: 1.6 }, 0.1)).toBe("length-1");
  });

  it("мимо подписи — ничего", () => {
    expect(findDimensionLabelAt(constraints, entities, { x: 35, y: 10 }, 0.1)).toBeNull();
  });
});
