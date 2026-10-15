import { describe, expect, it } from "vitest";
import type { SketchEntity } from "@/types/api";
import { dimensionPointTargets, pickDimensionTarget, targetOfEntity } from "./dimensionTargets";
import { SKETCH_ORIGIN_ID } from "./sketchOrigin";

const line: SketchEntity = { id: "l", type: "line", start: { x: 10, y: 10 }, end: { x: 50, y: 10 } };
const construction: SketchEntity = { id: "k", type: "line", start: { x: 10, y: 30 }, end: { x: 50, y: 30 }, construction: true };
const circle: SketchEntity = { id: "c", type: "circle", center: { x: 100, y: 0 }, radius: 20 };
const arc: SketchEntity = { id: "a", type: "arc", center: { x: -50, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2 };
const entities = [line, construction, circle, arc];

const pick = (x: number, y: number, threshold = 6) => pickDimensionTarget({ x, y }, entities, threshold);

describe("pickDimensionTarget", () => {
  it("конец отрезка важнее самого отрезка", () => {
    expect(pick(11, 10)).toMatchObject({ kind: "point", ref: { entity_id: "l", sub_index: 0 }, label: "Конец" });
    expect(pick(49, 11)).toMatchObject({ kind: "point", ref: { entity_id: "l", sub_index: 1 } });
  });

  it("середина отрезка выбирает отрезок целиком", () => {
    expect(pick(30, 11)).toMatchObject({ kind: "line", ref: { entity_id: "l", sub_index: 0 } });
  });

  it("центр окружности — точка, обод — окружность", () => {
    expect(pick(100.5, 0.5)).toMatchObject({ kind: "point", ref: { entity_id: "c", sub_index: 0 }, label: "Центр" });
    expect(pick(100, 19)).toMatchObject({ kind: "circle", radius: 20 });
  });

  it("центр и концы дуги — точки, сама дуга — дуга", () => {
    expect(pick(-50, 0)).toMatchObject({ kind: "point", ref: { entity_id: "a", sub_index: 0 } });
    expect(pick(-40, 0)).toMatchObject({ kind: "point", ref: { entity_id: "a", sub_index: 1 } });
    expect(pick(-50, 10)).toMatchObject({ kind: "point", ref: { entity_id: "a", sub_index: 2 } });
    const mid = Math.SQRT1_2 * 10;
    expect(pick(-50 + mid, mid)).toMatchObject({ kind: "arc" });
  });

  it("начало координат выбирается как точка", () => {
    expect(pick(0.5, -0.5)).toMatchObject({ kind: "point", ref: { entity_id: SKETCH_ORIGIN_ID, sub_index: 0 }, at: { x: 0, y: 0 } });
  });

  it("вспомогательная геометрия и пустое место не выбираются", () => {
    expect(pick(30, 30)).toBeNull();
    expect(pick(10, 30)).toBeNull();
    expect(pick(200, 200)).toBeNull();
  });

  it("из двух точек рядом берётся ближайшая", () => {
    const touching: SketchEntity = { id: "m", type: "line", start: { x: 1.5, y: 0 }, end: { x: 1.5, y: 40 } };
    expect(pickDimensionTarget({ x: 1.2, y: 0 }, [touching], 2)).toMatchObject({ ref: { entity_id: "m", sub_index: 0 } });
    expect(pickDimensionTarget({ x: 0.3, y: 0 }, [touching], 2)).toMatchObject({ ref: { entity_id: SKETCH_ORIGIN_ID } });
  });
});

describe("targetOfEntity", () => {
  it("отрезок, окружность и дуга становятся целями, прямоугольник нет", () => {
    expect(targetOfEntity(line)).toMatchObject({ kind: "line", segment: { start: line.start, end: line.end } });
    expect(targetOfEntity(circle)).toMatchObject({ kind: "circle", radius: 20 });
    expect(targetOfEntity(arc)).toMatchObject({ kind: "arc", radius: 10 });
    expect(targetOfEntity({ id: "r", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 1, y: 1 } })).toBeNull();
  });
});

describe("dimensionPointTargets", () => {
  it("концы, центры и начало координат без вспомогательной геометрии", () => {
    const refs = dimensionPointTargets(entities).map((t) => `${t.ref.entity_id}:${t.ref.sub_index}`);
    expect(refs).toEqual(["l:0", "l:1", "c:0", "a:0", "a:1", "a:2", `${SKETCH_ORIGIN_ID}:0`]);
  });
});
