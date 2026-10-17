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
  it("длина: размерная линия вынесена наружу от соседей, выносные линии от концов, стрелки на обоих концах", () => {
    const layout = layoutOf(dim("length", [at("a")], 40));
    expect(layout.text).toBe("40");
    expect(layout.label.x).toBeCloseTo(20, 6);
    expect(layout.label.y).toBeCloseTo(-2.4, 6);
    expect(layout.arrows.map((a) => a.tip.y)).toEqual([-2.4000000000000004, -2.4000000000000004]);
    expect(layout.arrows.map((a) => a.dir.x)).toEqual([-1, 1]);
    const [ext0, ext1] = layout.lines;
    expect(ext0[0].y).toBeCloseTo(-0.3, 6);
    expect(ext0[1].y).toBeCloseTo(-2.9, 6);
    expect(ext1[0].x).toBeCloseTo(40, 6);
  });

  it("длина одиночного отрезка выносится вверх, у вертикального - вправо", () => {
    const lone: SketchEntity[] = [
      { id: "h", type: "line", start: { x: 40, y: 0 }, end: { x: 0, y: 0 } },
      { id: "w", type: "line", start: { x: 100, y: 30 }, end: { x: 100, y: 0 } },
    ];
    const [h, w] = dimensionLayouts([dim("length", [at("h")], 40), { ...dim("length", [at("w")], 30), id: "w" }], lone, 0.1);
    expect(h.label.y).toBeCloseTo(2.4, 6);
    expect(w.label.x).toBeCloseTo(102.4, 6);
  });

  it("текст стоит в разрыве размерной линии", () => {
    const layout = layoutOf(dim("length", [at("a")], 40));
    const dimensionParts = layout.lines.slice(2);
    expect(dimensionParts).toHaveLength(2);
    expect(dimensionParts[0][1].x).toBeLessThan(layout.label.x - 1);
    expect(dimensionParts[1][0].x).toBeGreaterThan(layout.label.x + 1);
  });

  it("короткий размер: стрелки снаружи, текст рядом с линией", () => {
    const layout = layoutOf(dim("length", [at("a")], 40), 10);
    expect(layout.arrows.map((a) => a.dir.x)).toEqual([1, -1]);
    expect(layout.label.y).toBeLessThan(-240);
  });

  it("расстояние между параллельными: по середине перекрытия, без выносных при перекрытии", () => {
    const layout = layoutOf(dim("line_distance", [at("a"), at("b")], 20));
    expect(layout.label).toEqual({ x: 20, y: 10 });
    expect(layout.arrows.map((a) => a.tip)).toEqual([{ x: 20, y: 0 }, { x: 20, y: 20 }]);
    expect(layout.lines).toHaveLength(2);
  });

  it("от начала координат до линии: перпендикуляр с выносной от конца линии", () => {
    const shifted: SketchEntity[] = [{ id: "s", type: "line", start: { x: 10, y: 20 }, end: { x: 40, y: 20 } }];
    const layout = dimensionLayouts([dim("point_line_distance", [at(SKETCH_ORIGIN_ID), at("s")], 20)], shifted, 0.1)[0];
    expect(layout.arrows[0].tip).toEqual({ x: 0, y: 0 });
    expect(layout.arrows[1].tip.x).toBeCloseTo(0, 9);
    expect(layout.arrows[1].tip.y).toBeCloseTo(20, 9);
    const extension = layout.lines[0];
    expect(extension[0].x).toBeCloseTo(9.7, 6);
    expect(extension[1].x).toBeCloseTo(-0.5, 6);
  });

  it("горизонтальный и вертикальный размеры выносятся за точки в сторону от фигур", () => {
    const h = layoutOf(dim("horizontal_distance", [at("a", 0), at("b", 1)], 40));
    expect(h.label.x).toBeCloseTo(20, 9);
    expect(h.label.y).toBeCloseTo(-2.4, 9);
    const v = layoutOf(dim("vertical_distance", [at("a", 1), at("b", 1)], 20));
    expect(v.label).toEqual({ x: 42.4, y: 10 });
  });

  it("отступ между двумя прямоугольниками рисуется под ними", () => {
    const rects: SketchEntity[] = [
      { id: "ab", type: "line", start: { x: 0, y: 0 }, end: { x: 20, y: 0 } },
      { id: "ar", type: "line", start: { x: 20, y: 0 }, end: { x: 20, y: 15 } },
      { id: "bl", type: "line", start: { x: 40, y: 12 }, end: { x: 40, y: 0 } },
      { id: "bb", type: "line", start: { x: 40, y: 0 }, end: { x: 60, y: 0 } },
    ];
    const [gap] = dimensionLayouts([dim("horizontal_distance", [at("ab", 1), at("bb", 0)], 20)], rects, 0.1);
    expect(gap.label.x).toBeCloseTo(30, 9);
    expect(gap.label.y).toBeCloseTo(-2.4, 9);
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

  it("старое расстояние между точками выносится параллельно отрезку между ними", () => {
    const layout = layoutOf(dim("distance", [at("a", 1), at("b", 1)], 20));
    expect(layout.arrows.map((a) => a.tip)).toEqual([{ x: 42.4, y: 0 }, { x: 42.4, y: 20 }]);
  });

  it("радиус: одна стрелка на окружности, диаметр: две", () => {
    expect(layoutOf(dim("radius", [at("c")], 10)).arrows).toHaveLength(1);
    expect(layoutOf(dim("diameter", [at("c")], 20)).arrows).toHaveLength(2);
  });

  it("угол: стрелки на концах дуги по касательной", () => {
    const layout = layoutOf(dim("angle", [at("a"), at("v")], 90));
    expect(layout.arrows[0].tip.x).toBeCloseTo(3.2, 6);
    expect(layout.arrows[0].dir.y).toBeCloseTo(-1, 6);
    expect(layout.arrows[1].tip.y).toBeCloseTo(3.2, 6);
    expect(layout.arrows[1].dir.x).toBeCloseTo(-1, 6);
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
    expect(findDimensionLabelAt(constraints, entities, { x: 21, y: -2.4 }, 0.1)).toBe("length-1");
  });

  it("мимо подписи — ничего", () => {
    expect(findDimensionLabelAt(constraints, entities, { x: 35, y: 10 }, 0.1)).toBeNull();
  });
});
