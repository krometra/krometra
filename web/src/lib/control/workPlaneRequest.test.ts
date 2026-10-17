import { describe, expect, it } from "vitest";
import { INVALID } from "./params";
import { readPointInput, requestedWorkPlane, type VertexResolver } from "./workPlaneRequest";

const vertex: VertexResolver = (bodyId, point) => (point[0] === 0 ? { kind: "vertex", bodyId, edgeName: "e-1", adjacentEdgeName: "e-2" } : null);

function code(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("параметры plane.create", () => {
  it("смещённая: по умолчанию от XY, от грани — с телом", () => {
    expect(requestedWorkPlane({ kind: "offset", distance: 5 }, vertex)).toEqual({ kind: "offset", reference: { kind: "base", plane: "XY" }, distance: 5 });
    expect(requestedWorkPlane({ kind: "offset", bodyId: "b", faceId: "f-1", distance: -2 }, vertex))
      .toEqual({ kind: "offset", reference: { kind: "face", bodyId: "b", faceName: "f-1" }, distance: -2 });
    expect(code(() => requestedWorkPlane({ kind: "offset", faceId: "f-1" }, vertex))).toBe("invalid_params");
    expect(code(() => requestedWorkPlane({ kind: "offset", plane: "XZ", faceId: "f-1", bodyId: "b" }, vertex))).toBe("invalid_params");
  });

  it("под углом: ребро или отрезок эскиза, ровно одно", () => {
    expect(requestedWorkPlane({ kind: "angle", bodyId: "b", edgeId: "e-1", angle: 30 }, vertex))
      .toEqual({ kind: "angle", axis: { kind: "edge", bodyId: "b", edgeName: "e-1" }, reference: { kind: "base", plane: "XY" }, angle: 30 });
    expect(requestedWorkPlane({ kind: "angle", lineSketchId: "s", lineId: "l", referenceSketchId: "s" }, vertex))
      .toMatchObject({ axis: { kind: "sketch_line", sketchId: "s", entityId: "l" }, reference: { kind: "sketch", sketchId: "s" }, angle: 90 });
    expect(code(() => requestedWorkPlane({ kind: "angle" }, vertex))).toBe("invalid_params");
    expect(code(() => requestedWorkPlane({ kind: "angle", bodyId: "b", edgeId: "e", lineSketchId: "s", lineId: "l" }, vertex))).toBe("invalid_params");
  });

  it("три точки: вершины тела и точки эскиза", () => {
    const definition = requestedWorkPlane({
      kind: "three_points",
      bodyId: "b",
      points: [{ vertex: [0, 0, 0] }, { sketchId: "s", entityId: "l", subIndex: 1 }, { sketchId: "s", entityId: "l", subIndex: 0 }],
    }, vertex);
    expect(definition).toMatchObject({ kind: "three_points", points: [{ kind: "vertex", edgeName: "e-1" }, { kind: "sketch_point", subIndex: 1 }, { kind: "sketch_point" }] });
    expect(code(() => requestedWorkPlane({ kind: "three_points", bodyId: "b", points: [{ vertex: [5, 0, 0] }, { vertex: [0, 0, 0] }, { vertex: [0, 0, 0] }] }, vertex))).toBe("not_found");
    expect(code(() => requestedWorkPlane({ kind: "three_points", points: [] }, vertex))).toBe("invalid_params");
  });

  it("средняя: две грани одного тела", () => {
    expect(requestedWorkPlane({ kind: "midplane", bodyId: "b", faceIds: ["f-1", "f-2"] }, vertex))
      .toEqual({ kind: "midplane", faces: [{ bodyId: "b", faceName: "f-1" }, { bodyId: "b", faceName: "f-2" }] });
    expect(code(() => requestedWorkPlane({ kind: "midplane", bodyId: "b", faceIds: ["f-1"] }, vertex))).toBe("invalid_params");
  });

  it("разбирает точку из JSON", () => {
    expect(readPointInput({ vertex: [1, 2, 3] })).toEqual({ vertex: [1, 2, 3] });
    expect(readPointInput({ sketchId: "s", entityId: "l" })).toEqual({ sketchId: "s", entityId: "l", subIndex: 0 });
    expect(readPointInput({ vertex: [1, 2] })).toBe(INVALID);
  });
});
