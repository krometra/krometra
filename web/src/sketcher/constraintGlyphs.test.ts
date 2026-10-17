import { describe, expect, it } from "vitest";
import type { SketchConstraint, SketchEntity } from "@/types/api";
import { constraintEntityIds, constraintGlyphs, findConstraintGlyphAt } from "./constraintGlyphs";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
});

const circle = (id: string, x: number, y: number, radius: number): SketchEntity => ({ id, type: "circle", center: { x, y }, radius });

const constraint = (id: string, type: SketchConstraint["type"], anchors: [string, number][], value: number | null = null): SketchConstraint => ({
  id,
  type,
  anchors: anchors.map(([entity_id, sub_index]) => ({ entity_id, sub_index })),
  value,
});

const entities = [line("bottom", 0, 0, 40, 0), line("top", 0, 20, 40, 20), line("side", 40, 0, 40, 20), circle("c", 100, 0, 10)];

describe("constraintGlyphs", () => {
  it("горизонтальность — значок у середины отрезка, со сдвигом по нормали, не на самой линии", () => {
    const [glyph] = constraintGlyphs([constraint("h", "horizontal", [["bottom", 0]])], entities, 1);
    expect(glyph).toMatchObject({ constraintId: "h", text: "H", shape: "badge" });
    expect(glyph.at.x).toBeCloseTo(20);
    expect(glyph.at.y).toBeCloseTo(14);
  });

  it("равенство — по значку у каждого из пары, оба ведут к одному ограничению", () => {
    const glyphs = constraintGlyphs([constraint("eq", "equal", [["bottom", 0], ["top", 0]])], entities, 1);
    expect(glyphs).toHaveLength(2);
    expect(glyphs.every((g) => g.constraintId === "eq" && g.text === "=")).toBe(true);
    expect(glyphs[1].at.y).toBeCloseTo(34);
  });

  it("значки на одном объекте не перекрываются", () => {
    const glyphs = constraintGlyphs(
      [constraint("h", "horizontal", [["bottom", 0]]), constraint("f", "fix", [["bottom", -1]])],
      entities,
      1,
    );
    expect(glyphs).toHaveLength(2);
    expect(Math.abs(glyphs[0].at.x - glyphs[1].at.x)).toBeGreaterThanOrEqual(16);
  });

  it("совпадение — точка рядом с общей точкой, а не на ней", () => {
    const [glyph] = constraintGlyphs([constraint("k", "coincident", [["bottom", 1], ["side", 0]])], entities, 1);
    expect(glyph.shape).toBe("dot");
    expect(glyph.at.x).toBeGreaterThan(40);
    expect(glyph.at.y).toBeGreaterThan(0);
    expect(Math.hypot(glyph.at.x - 40, glyph.at.y)).toBeCloseTo(11);
  });

  it("центр окружности как точка совпадения берётся из центра, а не с обода", () => {
    const [glyph] = constraintGlyphs([constraint("k", "coincident", [["c", 0], ["bottom", 0]])], entities, 1);
    expect(Math.hypot(glyph.at.x - 100, glyph.at.y)).toBeCloseTo(11);
  });

  it("середина — у отрезка, точка на кривой — у точки", () => {
    const [mid, onCurve] = constraintGlyphs(
      [constraint("m", "midpoint", [["c", 0], ["top", 0]]), constraint("p", "point_on_curve", [["side", 1], ["c", 0]])],
      entities,
      1,
    );
    expect(mid).toMatchObject({ text: "△", at: { x: 20, y: 34 } });
    expect(onCurve.text).toBe("∈");
    expect(onCurve.at.x).toBeGreaterThan(40);
    expect(onCurve.at.y).toBeGreaterThan(20);
  });

  it("фиксация: объект целиком — у объекта, точка — у точки", () => {
    const [whole, point] = constraintGlyphs(
      [constraint("w", "fix", [["c", -1]]), constraint("p", "fix", [["side", 1]])],
      entities,
      1,
    );
    expect(Math.hypot(whole.at.x - 100, whole.at.y)).toBeCloseTo(24);
    expect(point.at.x).toBeGreaterThan(40);
    expect(point.at.y).toBeGreaterThan(20);
  });

  it("у размеров своих значков нет — у них подписи", () => {
    expect(constraintGlyphs([constraint("d", "length", [["bottom", 0]], 40)], entities, 1)).toEqual([]);
  });

  it("смещение задано в пикселях: при приближении значок ближе к линии в мм", () => {
    const [glyph] = constraintGlyphs([constraint("h", "horizontal", [["bottom", 0]])], entities, 0.5);
    expect(glyph.at.y).toBeCloseTo(7);
  });

  it("ссылка на удалённый объект не даёт значка", () => {
    expect(constraintGlyphs([constraint("h", "horizontal", [["gone", 0]])], entities, 1)).toEqual([]);
  });
});

describe("findConstraintGlyphAt", () => {
  const constraints = [constraint("eq", "equal", [["bottom", 0], ["top", 0]]), constraint("k", "coincident", [["bottom", 1], ["side", 0]])];

  it("попадание по любому значку пары возвращает ограничение", () => {
    const glyphs = constraintGlyphs(constraints, entities, 1);
    expect(findConstraintGlyphAt(glyphs, { x: 21, y: 15 }, 1)).toBe("eq");
    expect(findConstraintGlyphAt(glyphs, { x: 19, y: 33 }, 1)).toBe("eq");
  });

  it("мимо значков — ничего, и сама линия значком не считается", () => {
    const glyphs = constraintGlyphs(constraints, entities, 1);
    expect(findConstraintGlyphAt(glyphs, { x: 20, y: 0 }, 1)).toBeNull();
    expect(findConstraintGlyphAt(glyphs, { x: 40, y: 0 }, 1)).toBeNull();
  });

  it("точка совпадения ловится в своём квадрате", () => {
    const glyphs = constraintGlyphs(constraints, entities, 1);
    const dot = glyphs.find((g) => g.constraintId === "k")!;
    expect(findConstraintGlyphAt(glyphs, { x: dot.at.x + 5, y: dot.at.y - 5 }, 1)).toBe("k");
    expect(findConstraintGlyphAt(glyphs, { x: dot.at.x + 7, y: dot.at.y }, 1)).toBeNull();
  });
});

describe("constraintEntityIds", () => {
  it("участники без повторов и без начала координат", () => {
    expect(constraintEntityIds(constraint("k", "coincident", [["a", 0], ["a", 1]]))).toEqual(["a"]);
    expect(constraintEntityIds(constraint("m", "midpoint", [["sketch-origin", 0], ["b", 0]]))).toEqual(["b"]);
    expect(constraintEntityIds(constraint("eq", "equal", [["a", 0], ["b", 0]]))).toEqual(["a", "b"]);
  });
});
