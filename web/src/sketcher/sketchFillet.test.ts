import { describe, expect, it } from "vitest";
import type { SketchArc, SketchConstraint, SketchEntity, SketchLine } from "@/types/api";
import { findFilletCorner, filletLines, type FilletIds } from "./sketchFillet";
import { solveSketch } from "./solver/solveSketch";
import type { SketchEntity as SolverEntity } from "./solver/types";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchLine => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
});

function rectangle(): { entities: SketchEntity[]; constraints: SketchConstraint[] } {
  const entities = [line("b", 0, 0, 20, 0), line("r", 20, 0, 20, 10), line("t", 20, 10, 0, 10), line("l", 0, 10, 0, 0)];
  const ids = ["b", "r", "t", "l"];
  const constraints: SketchConstraint[] = [
    ...ids.map((id, i) => ({
      id: `c${i}`,
      type: "coincident" as const,
      anchors: [{ entity_id: id, sub_index: 1 }, { entity_id: ids[(i + 1) % 4], sub_index: 0 }],
      value: null,
    })),
    { id: "hb", type: "horizontal", anchors: [{ entity_id: "b", sub_index: 0 }], value: null },
    { id: "ht", type: "horizontal", anchors: [{ entity_id: "t", sub_index: 0 }], value: null },
    { id: "vr", type: "vertical", anchors: [{ entity_id: "r", sub_index: 0 }], value: null },
    { id: "vl", type: "vertical", anchors: [{ entity_id: "l", sub_index: 0 }], value: null },
    { id: "lb", type: "length", anchors: [{ entity_id: "b", sub_index: 0 }], value: 20 },
  ];
  return { entities, constraints };
}

function ids(): FilletIds {
  let n = 0;
  return { arcId: "arc", constraintId: () => `f${n++}` };
}

const byId = <T extends { id: string }>(list: T[], id: string) => list.find((e) => e.id === id)!;

describe("скругление угла эскиза", () => {
  it("находит угол прямоугольника под курсором", () => {
    const corner = findFilletCorner({ x: 19.8, y: 0.1 }, rectangle().entities, 1);
    expect(corner?.at).toEqual({ x: 20, y: 0 });
    expect(corner?.sides.map((s) => s.lineId).sort()).toEqual(["b", "r"]);
  });

  it("не находит угол вдали от вершин", () => {
    expect(findFilletCorner({ x: 10, y: 0 }, rectangle().entities, 1)).toBeNull();
  });

  it("укорачивает отрезки и вставляет касательную дугу", () => {
    const { entities, constraints } = rectangle();
    const corner = findFilletCorner({ x: 20, y: 0 }, entities, 1)!;
    const result = filletLines(entities, constraints, corner.sides, 3, ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = result.edit.entities;
    expect(byId(out, "b")).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 17, y: 0 } });
    expect((byId(out, "r") as SketchLine).start.y).toBeCloseTo(3, 9);
    const arc = byId(out, "arc") as SketchArc;
    expect(arc.center.x).toBeCloseTo(17, 9);
    expect(arc.center.y).toBeCloseTo(3, 9);
    expect(arc.endAngle - arc.startAngle).toBeCloseTo(Math.PI / 2, 9);
  });

  it("убирает ограничения старого угла и длину укороченного отрезка", () => {
    const { entities, constraints } = rectangle();
    const corner = findFilletCorner({ x: 20, y: 0 }, entities, 1)!;
    const result = filletLines(entities, constraints, corner.sides, 3, ids());
    if (!result.ok) throw new Error(result.error);
    const keptIds = result.edit.constraints.map((c) => c.id);
    expect(keptIds).not.toContain("c0");
    expect(keptIds).not.toContain("lb");
    expect(keptIds).toEqual(expect.arrayContaining(["c1", "c2", "c3", "hb", "vr"]));
    const types = result.edit.constraints.filter((c) => c.id.startsWith("f")).map((c) => c.type);
    expect(types.sort()).toEqual(["coincident", "coincident", "radius", "tangent", "tangent"]);
  });

  it("решатель держит скругление на месте", () => {
    const { entities, constraints } = rectangle();
    const corner = findFilletCorner({ x: 20, y: 0 }, entities, 1)!;
    const result = filletLines(entities, constraints, corner.sides, 3, ids());
    if (!result.ok) throw new Error(result.error);
    const out = solveSketch(result.edit.entities as SolverEntity[], result.edit.constraints);
    expect(out.residual).toBeLessThan(1e-3);
    expect(byId(out.entities, "arc").center!.x).toBeCloseTo(17, 3);
  });

  it("скругление едет за сдвинутой стороной и сохраняет радиус", () => {
    const { entities, constraints } = rectangle();
    const corner = findFilletCorner({ x: 20, y: 0 }, entities, 1)!;
    const result = filletLines(entities, constraints, corner.sides, 3, ids());
    if (!result.ok) throw new Error(result.error);
    const moved = result.edit.entities.map((e) =>
      e.id === "r" && e.type === "line" ? { ...e, start: { x: 25, y: e.start.y }, end: { x: 25, y: e.end.y } } : e,
    );
    const out = solveSketch(moved as SolverEntity[], result.edit.constraints);
    const arc = byId(out.entities, "arc");
    const right = byId(out.entities, "r");
    const bottom = byId(out.entities, "b");
    expect(out.residual).toBeLessThan(1e-2);
    expect(arc.radius).toBeCloseTo(3, 2);
    expect(arc.center!.x - right.start!.x).toBeCloseTo(-3, 2);
    expect(arc.center!.y - bottom.end!.y).toBeCloseTo(3, 2);
    expect(bottom.end!.x).toBeCloseTo(arc.center!.x, 2);
  });

  it("смена радиуса сдвигает точки касания", () => {
    const { entities, constraints } = rectangle();
    const corner = findFilletCorner({ x: 20, y: 0 }, entities, 1)!;
    const result = filletLines(entities, constraints.filter((c) => c.id !== "lb"), corner.sides, 3, ids());
    if (!result.ok) throw new Error(result.error);
    const resized = result.edit.constraints.map((c) => (c.type === "radius" ? { ...c, value: 5 } : c));
    const out = solveSketch(result.edit.entities as SolverEntity[], resized);
    expect(out.residual).toBeLessThan(1e-2);
    expect(byId(out.entities, "arc").radius).toBeCloseTo(5, 2);
    expect(byId(out.entities, "b").end!.x).toBeCloseTo(byId(out.entities, "arc").center!.x, 2);
    expect(byId(out.entities, "b").start!.y).toBeCloseTo(0, 2);
    expect(byId(out.entities, "r").start!.x).toBeCloseTo(20, 2);
    expect(byId(out.entities, "arc").center!.x).toBeCloseTo(15, 2);
  });

  it("без ограничений на стороны смена радиуса их тоже не двигает", () => {
    const entities = [line("b", 0, 0, 20, 0), line("r", 20, 0, 20, 10)];
    const result = filletLines(entities, [], [{ lineId: "b", keep: { x: 5, y: 0 } }, { lineId: "r", keep: { x: 20, y: 5 } }], 2, ids());
    if (!result.ok) throw new Error(result.error);
    const resized = result.edit.constraints.map((c) => (c.type === "radius" ? { ...c, value: 4 } : c));
    const out = solveSketch(result.edit.entities as SolverEntity[], resized);
    expect(out.residual).toBeLessThan(1e-2);
    expect(byId(out.entities, "b").start).toEqual({ x: 0, y: 0 });
    expect(byId(out.entities, "b").end!.y).toBeCloseTo(0, 2);
    expect(byId(out.entities, "r").end).toEqual({ x: 20, y: 10 });
    expect(byId(out.entities, "r").start!.x).toBeCloseTo(20, 2);
    expect(byId(out.entities, "arc").center!.x).toBeCloseTo(16, 2);
  });

  it("слишком большой радиус — ошибка без правки", () => {
    const { entities, constraints } = rectangle();
    const corner = findFilletCorner({ x: 20, y: 0 }, entities, 1)!;
    const result = filletLines(entities, constraints, corner.sides, 11, ids());
    expect(result).toEqual({ ok: false, error: "Радиус слишком большой для этих отрезков" });
  });

  it("скругляет пересекающиеся отрезки со стороны кликов", () => {
    const entities = [line("h", -10, 0, 10, 0), line("v", 0, -10, 0, 10)];
    const result = filletLines(entities, [], [{ lineId: "h", keep: { x: 5, y: 0 } }, { lineId: "v", keep: { x: 0, y: 5 } }], 2, ids());
    if (!result.ok) throw new Error(result.error);
    const h = byId(result.edit.entities, "h") as SketchLine;
    const v = byId(result.edit.entities, "v") as SketchLine;
    expect(h.start.x).toBeCloseTo(2, 9);
    expect(h.end).toEqual({ x: 10, y: 0 });
    expect(v.start.y).toBeCloseTo(2, 9);
    expect(v.end).toEqual({ x: 0, y: 10 });
    const arc = byId(result.edit.entities, "arc") as SketchArc;
    expect(arc.center.x).toBeCloseTo(2, 9);
    expect(arc.center.y).toBeCloseTo(2, 9);
  });

  it("параллельные отрезки не скругляются", () => {
    const entities = [line("a", 0, 0, 10, 0), line("b", 0, 5, 10, 5)];
    const result = filletLines(entities, [], [{ lineId: "a", keep: { x: 5, y: 0 } }, { lineId: "b", keep: { x: 5, y: 5 } }], 1, ids());
    expect(result.ok).toBe(false);
  });
});
