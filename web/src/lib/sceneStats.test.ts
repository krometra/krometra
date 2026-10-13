import { describe, it, expect } from "vitest";
import { sceneStats, type CountableBody } from "./sceneStats";
import type { MeshData } from "@/types/api";

const mesh = (faces: number, edges: number) =>
  ({
    vertices: [],
    indices: [],
    bbox: { min: [0, 0, 0], max: [1, 1, 1] },
    face_triangle_map: [],
    brep_topo: {
      faces: Array.from({ length: faces }, (_, i) => ({ face_id: i, edges: [] })),
      edges: Array.from({ length: edges }, (_, i) => ({ edge_id: i, vertices: [0, 1] })),
    },
  }) as unknown as MeshData;

const body = (id: string, visible?: boolean): CountableBody => ({ id, visible });

describe("sceneStats", () => {
  it("считает грани и рёбра одного видимого тела", () => {
    expect(sceneStats([body("a")], [{ body_id: "a", mesh: mesh(6, 12) }])).toEqual({
      bodies: 1,
      faces: 6,
      edges: 12,
    });
  });

  it("не приплюсовывает скрытое промежуточное тело (репро «1 тело · 17 граней»)", () => {
    const bodies = [body("a", false), body("b", true)];
    const meshes = [
      { body_id: "a", mesh: mesh(6, 12) },
      { body_id: "b", mesh: mesh(11, 24) },
    ];
    expect(sceneStats(bodies, meshes)).toEqual({ bodies: 1, faces: 11, edges: 24 });
  });

  it("тело без флага visible считается видимым", () => {
    expect(sceneStats([body("a", undefined)], [{ body_id: "a", mesh: mesh(6, 12) }]).bodies).toBe(1);
  });

  it("суммирует несколько видимых тел", () => {
    const bodies = [body("a"), body("b")];
    const meshes = [
      { body_id: "a", mesh: mesh(6, 12) },
      { body_id: "b", mesh: mesh(5, 9) },
    ];
    expect(sceneStats(bodies, meshes)).toEqual({ bodies: 2, faces: 11, edges: 21 });
  });

  it("меш без тела в документе не попадает в счётчик", () => {
    expect(sceneStats([body("a")], [{ body_id: "ghost", mesh: mesh(6, 12) }])).toEqual({
      bodies: 1,
      faces: 0,
      edges: 0,
    });
  });

  it("дубль меша не удваивает счётчик", () => {
    const meshes = [
      { body_id: "a", mesh: mesh(6, 12) },
      { body_id: "a", mesh: mesh(6, 12) },
    ];
    expect(sceneStats([body("a")], meshes)).toEqual({ bodies: 1, faces: 6, edges: 12 });
  });

  it("тело без загруженного меша считается телом, но не даёт граней", () => {
    expect(sceneStats([body("a"), body("b")], [{ body_id: "a", mesh: mesh(6, 12) }])).toEqual({
      bodies: 2,
      faces: 6,
      edges: 12,
    });
  });

  it("пустая сцена даёт нули", () => {
    expect(sceneStats([], [])).toEqual({ bodies: 0, faces: 0, edges: 0 });
  });
});
