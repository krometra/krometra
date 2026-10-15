import { describe, expect, it } from "vitest";
import type { SketchPoint } from "@/types/api";
import {
  angleDraft,
  defaultCursor,
  pointPairType,
  resolveDimension,
  sameTarget,
  type DimensionResolution,
  type DimensionTarget,
  type LineTarget,
  type RoundTarget,
} from "./dimensionPlan";
import { SKETCH_ORIGIN_ID } from "./sketchOrigin";

const p = (x: number, y: number): SketchPoint => ({ x, y });
const line = (id: string, x1: number, y1: number, x2: number, y2: number): LineTarget => ({
  kind: "line",
  ref: { entity_id: id, sub_index: 0 },
  segment: { start: p(x1, y1), end: p(x2, y2) },
});
const point = (id: string, sub: number, x: number, y: number): DimensionTarget => ({
  kind: "point",
  ref: { entity_id: id, sub_index: sub },
  at: p(x, y),
});
const circle = (id: string, x: number, y: number, r: number): RoundTarget => ({
  kind: "circle",
  ref: { entity_id: id, sub_index: 0 },
  center: p(x, y),
  radius: r,
});
const arc = (id: string, x: number, y: number, r: number): RoundTarget => ({ ...circle(id, x, y, r), kind: "arc" });

const origin = point(SKETCH_ORIGIN_ID, 0, 0, 0);

function draftOf(resolution: DimensionResolution) {
  if (resolution.status !== "ready") throw new Error(`ожидался готовый размер, а не ${JSON.stringify(resolution)}`);
  return { ...resolution.draft, placement: resolution.placement };
}

describe("resolveDimension: один объект", () => {
  it("без выбора просит указать объект", () => {
    expect(resolveDimension([], p(0, 0))).toEqual({ status: "incomplete", hint: expect.stringContaining("выберите") });
  });

  it("отрезок даёт длину, размер ставится кликом", () => {
    expect(draftOf(resolveDimension([line("a", 0, 0, 3, 4)], p(0, 0)))).toEqual({
      type: "length",
      anchors: [{ entity_id: "a", sub_index: 0 }],
      value: 5,
      placement: "cursor",
    });
  });

  it("окружность даёт диаметр сразу", () => {
    expect(draftOf(resolveDimension([circle("c", 1, 1, 28.25)], p(0, 0)))).toMatchObject({
      type: "diameter",
      value: 56.5,
      placement: "immediate",
    });
  });

  it("дуга даёт радиус сразу", () => {
    expect(draftOf(resolveDimension([arc("r", 0, 0, 12)], p(0, 0)))).toMatchObject({ type: "radius", value: 12, placement: "immediate" });
  });

  it("одна точка ждёт второй объект", () => {
    expect(resolveDimension([point("a", 1, 2, 3)], p(0, 0)).status).toBe("incomplete");
  });
});

describe("resolveDimension: два отрезка", () => {
  it("параллельные дают расстояние между ними", () => {
    expect(draftOf(resolveDimension([line("a", 0, 0, 10, 0), line("b", 10, 7, 0, 7)], p(0, 0)))).toEqual({
      type: "line_distance",
      anchors: [{ entity_id: "a", sub_index: 0 }, { entity_id: "b", sub_index: 0 }],
      value: 7,
      placement: "immediate",
    });
  });

  it("почти параллельные в пределах полградуса тоже", () => {
    const tilt = Math.tan((0.3 * Math.PI) / 180) * 10;
    expect(draftOf(resolveDimension([line("a", 0, 0, 0, 10), line("b", 20, 0, 20 + tilt, 10)], p(0, 0))).type).toBe("line_distance");
  });

  it("непараллельные дают угол, размер ставится кликом", () => {
    const d = draftOf(resolveDimension([line("a", 0, 0, 10, 0), line("b", 0, 0, 10, 10)], p(8, 2)));
    expect(d.type).toBe("angle");
    expect(d.value).toBeCloseTo(45, 6);
    expect(d.placement).toBe("cursor");
  });

  it("тот же отрезок дважды недопустим", () => {
    expect(resolveDimension([line("a", 0, 0, 10, 0), line("a", 0, 0, 10, 0)], p(0, 0))).toEqual({
      status: "invalid",
      reason: "это тот же отрезок",
    });
  });
});

describe("resolveDimension: точка и линия", () => {
  it("точка и отрезок в любом порядке дают перпендикулярное расстояние, точка первой", () => {
    for (const targets of [[point("p", 1, 3, 9), line("l", 0, 0, 10, 0)], [line("l", 0, 0, 10, 0), point("p", 1, 3, 9)]]) {
      expect(draftOf(resolveDimension(targets, p(0, 0)))).toEqual({
        type: "point_line_distance",
        anchors: [{ entity_id: "p", sub_index: 1 }, { entity_id: "l", sub_index: 0 }],
        value: 9,
        placement: "immediate",
      });
    }
  });

  it("начало координат и отрезок", () => {
    expect(draftOf(resolveDimension([origin, line("l", -5, 4, 5, 4)], p(0, 0)))).toMatchObject({
      type: "point_line_distance",
      anchors: [{ entity_id: SKETCH_ORIGIN_ID, sub_index: 0 }, { entity_id: "l", sub_index: 0 }],
      value: 4,
    });
  });

  it("окружность с отрезком меряет от центра", () => {
    expect(draftOf(resolveDimension([circle("c", 2, 6, 3), line("l", 0, 0, 10, 0)], p(0, 0)))).toMatchObject({
      type: "point_line_distance",
      anchors: [{ entity_id: "c", sub_index: 0 }, { entity_id: "l", sub_index: 0 }],
      value: 6,
    });
  });

  it("конец этого же отрезка недопустим", () => {
    expect(resolveDimension([point("l", 1, 10, 0), line("l", 0, 0, 10, 0)], p(0, 0))).toEqual({
      status: "invalid",
      reason: "точка лежит на этом же отрезке",
    });
  });
});

describe("resolveDimension: две точки", () => {
  const a = point("a", 0, 0, 0);
  const b = point("b", 1, 20, 10);

  it("курсор выше или ниже пары даёт горизонтальный размер", () => {
    expect(draftOf(resolveDimension([a, b], p(10, 30)))).toMatchObject({ type: "horizontal_distance", value: 20, placement: "cursor" });
    expect(draftOf(resolveDimension([a, b], p(10, -30)))).toMatchObject({ type: "horizontal_distance", value: 20 });
  });

  it("курсор левее или правее пары даёт вертикальный размер", () => {
    expect(draftOf(resolveDimension([a, b], p(40, 5)))).toMatchObject({ type: "vertical_distance", value: 10 });
    expect(draftOf(resolveDimension([a, b], p(-40, 5)))).toMatchObject({ type: "vertical_distance", value: 10 });
  });

  it("курсор внутри габарита или по диагонали даёт наклонный размер", () => {
    expect(draftOf(resolveDimension([a, b], p(10, 5)))).toMatchObject({ type: "distance", value: Math.hypot(20, 10) });
    expect(draftOf(resolveDimension([a, b], p(40, 40)))).toMatchObject({ type: "distance" });
  });

  it("якоря в порядке выбора", () => {
    expect(draftOf(resolveDimension([b, a], p(10, 30))).anchors).toEqual([b.ref, a.ref]);
  });

  it("центры двух окружностей", () => {
    expect(draftOf(resolveDimension([circle("c1", 0, 0, 1), circle("c2", 30, 0, 1)], p(15, 10)))).toMatchObject({
      type: "horizontal_distance",
      anchors: [{ entity_id: "c1", sub_index: 0 }, { entity_id: "c2", sub_index: 0 }],
      value: 30,
    });
  });

  it("та же точка и совпадающие точки недопустимы", () => {
    expect(resolveDimension([a, a], p(0, 0))).toEqual({ status: "invalid", reason: "это та же точка" });
    expect(resolveDimension([a, point("z", 1, 0, 0)], p(0, 0))).toEqual({ status: "invalid", reason: "точки совпадают" });
  });
});

describe("resolveDimension: больше двух", () => {
  it("три объекта недопустимы", () => {
    expect(resolveDimension([line("a", 0, 0, 1, 0), line("b", 0, 1, 1, 1), line("c", 0, 2, 1, 2)], p(0, 0))).toEqual({
      status: "invalid",
      reason: "только для одного или двух объектов, выбрано 3",
    });
  });
});

describe("pointPairType", () => {
  it("совпадающие по X точки: горизонтальный размер недостижим", () => {
    expect(pointPairType(p(0, 0), p(0, 10), p(0, 30))).toBe("distance");
    expect(pointPairType(p(0, 0), p(0, 10), p(5, 5))).toBe("vertical_distance");
  });
});

describe("angleDraft: квадрант по курсору", () => {
  const a = line("a", -10, 0, 10, 0);
  const b = line("b", 0, -10, 0, 10);
  const value = (cursor: SketchPoint) => angleDraft(a, b, cursor);

  it("в каждом квадранте 90° и лучи смотрят в сторону курсора", () => {
    expect(value(p(5, 5))).toEqual({ type: "angle", anchors: [{ entity_id: "a", sub_index: 0 }, { entity_id: "b", sub_index: 0 }], value: 90 });
    expect(value(p(-5, 5)).anchors).toEqual([{ entity_id: "b", sub_index: 0 }, { entity_id: "a", sub_index: 1 }]);
    expect(value(p(-5, -5)).anchors).toEqual([{ entity_id: "a", sub_index: 1 }, { entity_id: "b", sub_index: 1 }]);
    expect(value(p(5, -5)).anchors).toEqual([{ entity_id: "b", sub_index: 1 }, { entity_id: "a", sub_index: 0 }]);
  });

  it("острый и тупой угол между наклонными в зависимости от сектора", () => {
    const s = line("s", 0, 0, 10, 0);
    const t = line("t", 0, 0, 10, 10 * Math.tan((75 * Math.PI) / 180));
    expect(angleDraft(s, t, p(10, 5)).value).toBeCloseTo(75, 6);
    expect(angleDraft(s, t, p(-10, 5)).value).toBeCloseTo(105, 6);
  });
});

describe("вспомогательное", () => {
  it("sameTarget различает точки одного объекта", () => {
    expect(sameTarget(point("a", 0, 0, 0), point("a", 1, 1, 1))).toBe(false);
    expect(sameTarget(point("a", 0, 0, 0), point("a", 0, 5, 5))).toBe(true);
    expect(sameTarget(point("a", 0, 0, 0), line("a", 0, 0, 1, 1))).toBe(false);
  });

  it("defaultCursor — среднее центров выбранного", () => {
    expect(defaultCursor([line("a", 0, 0, 10, 0), circle("c", 10, 10, 2)])).toEqual({ x: 7.5, y: 5 });
  });
});
