import { describe, expect, it } from "vitest";
import { planarFaceFrame, type FaceMesh } from "./faceFrame";

function quad(corners: number[][], faceId: string): FaceMesh {
  return { vertices: corners.flat(), indices: [0, 1, 2, 0, 2, 3], faceMap: [faceId, faceId] };
}

function merge(...meshes: FaceMesh[]): FaceMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  const faceMap: (string | number)[] = [];
  for (const mesh of meshes) {
    const base = vertices.length / 3;
    vertices.push(...Array.from(mesh.vertices));
    indices.push(...Array.from(mesh.indices, (index) => index + base));
    faceMap.push(...Array.from(mesh.faceMap));
  }
  return { vertices, indices, faceMap };
}

describe("planarFaceFrame", () => {
  it("верхняя грань коробки: центр, нормаль наружу, радиус до угла", () => {
    const top = quad([[0, 0, 10], [20, 0, 10], [20, 10, 10], [0, 10, 10]], "f-top");
    const frame = planarFaceFrame(top, "f-top");
    expect(frame?.center).toEqual([10, 5, 10]);
    expect(frame?.normal).toEqual([0, 0, 1]);
    expect(frame?.radius).toBeCloseTo(Math.hypot(10, 5));
  });

  it("нормаль следует обходу треугольников", () => {
    const bottom = quad([[0, 0, 0], [0, 10, 0], [20, 10, 0], [20, 0, 0]], "f-bottom");
    expect(planarFaceFrame(bottom, "f-bottom")?.normal).toEqual([0, 0, -1]);
  });

  it("наклонная грань: центр лежит в плоскости грани", () => {
    const slope = quad([[0, 0, 0], [10, 0, 10], [10, 10, 10], [0, 10, 0]], "f-slope");
    const frame = planarFaceFrame(slope, "f-slope");
    expect(frame).not.toBeNull();
    const [nx, ny, nz] = frame!.normal;
    expect(nx).toBeCloseTo(-Math.SQRT1_2);
    expect(ny).toBeCloseTo(0);
    expect(nz).toBeCloseTo(Math.SQRT1_2);
    expect(frame!.center[0]).toBeCloseTo(frame!.center[2]);
  });

  it("берёт только треугольники своей грани, числовой и строковый id равны", () => {
    const mesh = merge(
      quad([[0, 0, 10], [20, 0, 10], [20, 10, 10], [0, 10, 10]], "3"),
      quad([[0, 0, 0], [20, 0, 0], [20, 0, 10], [0, 0, 10]], "4"),
    );
    expect(planarFaceFrame(mesh, 3)?.normal).toEqual([0, 0, 1]);
  });

  it("гнутая грань не плоская", () => {
    const bent = merge(
      quad([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]], "f-bent"),
      quad([[10, 0, 0], [20, 0, 5], [20, 10, 5], [10, 10, 0]], "f-bent"),
    );
    expect(planarFaceFrame(bent, "f-bent")).toBeNull();
  });

  it("неизвестная грань и вырожденные треугольники дают null", () => {
    const top = quad([[0, 0, 10], [20, 0, 10], [20, 10, 10], [0, 10, 10]], "f-top");
    expect(planarFaceFrame(top, "f-missing")).toBeNull();
    const degenerate = quad([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]], "f-line");
    expect(planarFaceFrame(degenerate, "f-line")).toBeNull();
  });
});
