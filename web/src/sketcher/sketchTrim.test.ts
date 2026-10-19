import { describe, expect, it } from "vitest";
import type { SketchArc, SketchConstraint, SketchEntity, SketchLine } from "@/types/api";
import { applyTrim, findTrimTarget, type TrimIds } from "./sketchTrim";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchLine => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
});

function ids(): TrimIds {
  let e = 0;
  let c = 0;
  return { entityId: () => `n${e++}`, constraintId: () => `k${c++}` };
}

const byId = <T extends { id: string }>(list: T[], id: string) => list.find((e) => e.id === id)!;

function trim(world: { x: number; y: number }, entities: SketchEntity[], constraints: SketchConstraint[] = []) {
  const target = findTrimTarget(world, entities, 0.5);
  if (!target) throw new Error("нет цели");
  return { target, edit: applyTrim(target, entities, constraints, ids()) };
}

describe("усечение кривых эскиза", () => {
  it("отрезок без пересечений удаляется целиком вместе с ограничениями", () => {
    const constraints: SketchConstraint[] = [{ id: "h", type: "horizontal", anchors: [{ entity_id: "a", sub_index: 0 }], value: null }];
    const { edit } = trim({ x: 5, y: 0 }, [line("a", 0, 0, 10, 0)], constraints);
    expect(edit.entities).toEqual([]);
    expect(edit.constraints).toEqual([]);
  });

  it("обрезает хвост отрезка до пересечения и привязывает конец к секущей", () => {
    const entities = [line("a", 0, 0, 10, 0), line("v", 6, -5, 6, 5)];
    const { target, edit } = trim({ x: 8, y: 0 }, entities);
    expect(target.piece).toMatchObject({ type: "line", start: { x: 6, y: 0 }, end: { x: 10, y: 0 } });
    expect(byId(edit.entities, "a")).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 6, y: 0 } });
    expect(edit.constraints).toEqual([
      { id: "k0", type: "point_on_curve", anchors: [{ entity_id: "a", sub_index: 1 }, { entity_id: "v", sub_index: 0 }], value: null },
    ]);
  });

  it("обрезает начало отрезка", () => {
    const entities = [line("a", 0, 0, 10, 0), line("v", 6, -5, 6, 5)];
    const { edit } = trim({ x: 2, y: 0 }, entities);
    expect(byId(edit.entities, "a")).toMatchObject({ start: { x: 6, y: 0 }, end: { x: 10, y: 0 } });
  });

  it("вырезает середину между двумя пересечениями и делит отрезок", () => {
    const entities = [line("a", 0, 0, 10, 0), line("v1", 3, -5, 3, 5), line("v2", 7, -5, 7, 5)];
    const constraints: SketchConstraint[] = [
      { id: "h", type: "horizontal", anchors: [{ entity_id: "a", sub_index: 0 }], value: null },
      { id: "end", type: "coincident", anchors: [{ entity_id: "a", sub_index: 1 }, { entity_id: "x", sub_index: 0 }], value: null },
      { id: "len", type: "length", anchors: [{ entity_id: "a", sub_index: 0 }], value: 10 },
    ];
    const { edit } = trim({ x: 5, y: 0 }, entities, constraints);
    expect(byId(edit.entities, "a")).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 3, y: 0 } });
    expect(byId(edit.entities, "n0")).toMatchObject({ start: { x: 7, y: 0 }, end: { x: 10, y: 0 } });
    const kept = new Map(edit.constraints.map((c) => [c.id, c]));
    expect(kept.has("len")).toBe(false);
    expect(kept.get("h")?.anchors).toEqual([{ entity_id: "a", sub_index: 0 }]);
    expect(kept.get("end")?.anchors[0]).toEqual({ entity_id: "n0", sub_index: 1 });
    expect(edit.constraints.map((c) => c.type)).toEqual(expect.arrayContaining(["collinear", "point_on_curve", "point_on_curve"]));
  });

  it("сторона прямоугольника режется до соседнего пересечения", () => {
    const entities = [line("b", 0, 0, 20, 0), line("r", 20, 0, 20, 10), line("l", 0, 10, 0, 0), line("m", 10, -5, 10, 5)];
    const { target } = trim({ x: 15, y: 0 }, entities);
    expect(target.piece).toMatchObject({ start: { x: 10, y: 0 }, end: { x: 20, y: 0 } });
  });

  it("окружность с двумя пересечениями превращается в дугу без отрезанного куска", () => {
    const entities: SketchEntity[] = [{ id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 5 }, line("v", 3, -10, 3, 10)];
    const { target, edit } = trim({ x: 5, y: 0 }, entities);
    const piece = target.piece as SketchArc;
    expect(Math.cos(piece.startAngle) * 5).toBeCloseTo(3, 6);
    const arc = byId(edit.entities, "c") as SketchArc;
    expect(arc.type).toBe("arc");
    expect(arc.center.x + arc.radius * Math.cos(arc.startAngle)).toBeCloseTo(3, 6);
    expect(arc.center.x + arc.radius * Math.cos(arc.endAngle)).toBeCloseTo(3, 6);
    expect(arc.center.x + arc.radius * Math.cos((arc.startAngle + arc.endAngle) / 2)).toBeCloseTo(-5, 6);
    expect(edit.constraints.filter((c) => c.type === "point_on_curve")).toHaveLength(2);
  });

  it("дуга обрезается с нужного конца", () => {
    const entities: SketchEntity[] = [
      { id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI },
      line("v", 0, -10, 0, 10),
    ];
    const { edit } = trim({ x: 3.5, y: 3.5 }, entities);
    const arc = byId(edit.entities, "a") as SketchArc;
    expect(arc.startAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(arc.endAngle).toBeCloseTo(Math.PI, 6);
  });

  it("секущая вспомогательная прямая тоже режет", () => {
    const entities: SketchEntity[] = [line("a", 0, 0, 10, 0), { id: "i", type: "infline", point: { x: 4, y: 100 }, angle: Math.PI / 2 }];
    const { edit } = trim({ x: 1, y: 0 }, entities);
    expect((byId(edit.entities, "a") as SketchLine).start.x).toBeCloseTo(4, 6);
  });

  it("мимо кривых цели нет", () => {
    expect(findTrimTarget({ x: 50, y: 50 }, [line("a", 0, 0, 10, 0)], 0.5)).toBeNull();
  });
});
