import { describe, expect, it } from "vitest";
import type { MeshData } from "@/types/api";
import { modelArrowLength, pressPullGhost } from "./pressPullPreview";

function squareMesh(): MeshData {
  return {
    vertices: [0, 0, 10, 20, 0, 10, 20, 20, 10, 0, 20, 10, 0, 0, 0, 20, 0, 0],
    indices: [0, 1, 2, 0, 2, 3, 0, 4, 5],
    face_triangle_map: ["f-top", "f-top", "f-front"],
    brep_topo: { faces: [], edges: [] },
    bbox: { min: [0, 0, 0], max: [20, 20, 10] },
  } as MeshData;
}

function zValues(positions: number[]): number[] {
  return positions.filter((_, index) => index % 3 === 2);
}

describe("pressPullGhost", () => {
  it("сдвигает треугольники грани по нормали на смещение со знаком", () => {
    const up = pressPullGhost(squareMesh(), ["f-top"], 5);
    const down = pressPullGhost(squareMesh(), ["f-top"], -0.07);

    expect(up.positions).toHaveLength(2 * 3 * 3);
    expect(new Set(zValues(up.positions))).toEqual(new Set([15]));
    zValues(down.positions).forEach((z) => expect(z).toBeCloseTo(9.93, 9));
  });

  it("стрелка смотрит по знаку и не короче доли модели", () => {
    const mesh = squareMesh();
    const [up] = pressPullGhost(mesh, ["f-top"], 5).arrows;
    const [down] = pressPullGhost(mesh, ["f-top"], -0.07).arrows;

    expect(up.direction).toEqual([0, 0, 1]);
    expect(up.length).toBe(Math.max(5, modelArrowLength(mesh)));
    expect(down.direction).toEqual([-0, -0, -1]);
    expect(down.length).toBeCloseTo(modelArrowLength(mesh), 9);
    expect(up.origin[2]).toBe(10);
  });

  it("неизвестная грань пропускается, несколько граней дают по стрелке", () => {
    const ghost = pressPullGhost(squareMesh(), ["f-top", "f-missing", "f-front"], 1);

    expect(ghost.arrows).toHaveLength(2);
    expect(ghost.positions).toHaveLength(3 * 3 * 3);
  });
});
