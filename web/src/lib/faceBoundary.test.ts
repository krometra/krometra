import { describe, expect, it } from "vitest";
import type { MeshData, PlaneBasis, SketchEntity } from "@/types/api";
import { faceBoundaryEntities } from "./faceBoundary";

const XY: PlaneBasis = { origin: [0, 0, 5], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };

function segments(points: [number, number][]): number[] {
  return points.slice(1).flatMap(([x, y], index) => [points[index][0], points[index][1], 5, x, y, 5]);
}

function arcPoints(cx: number, cy: number, r: number, from: number, to: number, count: number): [number, number][] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / count;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}

function mesh(edges: Record<string, number[]>): MeshData {
  return {
    vertices: [],
    indices: [],
    face_triangle_map: [],
    bbox: { min: [0, 0, 0], max: [0, 0, 0] },
    brep_topo: {
      faces: [{ face_id: "f-top", edges: Object.keys(edges) }],
      edges: Object.entries(edges).map(([edge_id, polyline]) => ({ edge_id, vertices: [], polyline })),
    },
  };
}

describe("faceBoundaryEntities", () => {
  it("круглую кромку отдаёт одной окружностью построения", () => {
    const entities = faceBoundaryEntities(mesh({ "e-ring": segments(arcPoints(1, 2, 6, 0, Math.PI * 2, 77)) }), "f-top", XY);
    expect(entities).toHaveLength(1);
    const [circle] = entities as Extract<SketchEntity, { type: "circle" }>[];
    expect(circle.type).toBe("circle");
    expect(circle.construction).toBe(true);
    expect(circle.radius).toBeCloseTo(6, 6);
    expect(circle.center.x).toBeCloseTo(1, 6);
    expect(circle.center.y).toBeCloseTo(2, 6);
  });

  it("прямую кромку отдаёт одним отрезком, дугу — дугой против часовой", () => {
    const entities = faceBoundaryEntities(
      mesh({
        "e-line": segments([[0, 0], [5, 0], [10, 0]]),
        "e-arc": segments(arcPoints(0, 0, 10, Math.PI / 2, 0, 20)),
      }),
      "f-top",
      XY,
    ) as SketchEntity[];
    expect(entities.map((entity) => entity.type)).toEqual(["line", "arc"]);
    const arc = entities[1] as Extract<SketchEntity, { type: "arc" }>;
    expect(arc.radius).toBeCloseTo(10, 6);
    expect(arc.startAngle).toBeCloseTo(0, 6);
    expect(arc.endAngle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("без ломаных рёбер возвращает null, чтобы взять контур по сетке", () => {
    const data = mesh({ "e-x": [] });
    expect(faceBoundaryEntities(data, "f-top", XY)).toBeNull();
    expect(faceBoundaryEntities(data, "f-missing", XY)).toBeNull();
  });
});
