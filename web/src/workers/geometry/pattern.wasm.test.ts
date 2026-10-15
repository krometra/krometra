import { beforeAll, describe, expect, it, vi } from "vitest";
import { Edge, Face, getOC, measureVolume, setOC } from "replicad";
import type { PatternMode, PatternSpec } from "@/lib/bodyPattern";
import type { SketchEntity } from "@/types/api";
import { booleanNamed } from "./boolean";
import { extrudeNamed } from "./extrude";
import { withTopology, type NamedShape } from "./naming";
import { patternNamed } from "./pattern";
import { runRebuildRequest } from "./rebuild";
import { namedBodyShape, publishNamed, releaseShape, retainShape } from "./shapes";

vi.mock("./occt", () => ({ initOcct: () => Promise.resolve() }));

beforeAll(async () => {
  const { default: initOpenCascade } = await import("replicad-opencascadejs");
  const wasmPath = decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setOC(await initOpenCascade({ locateFile: () => wasmPath }));
}, 60_000);

const rectangle = (x: number, y: number, width: number, depth: number): SketchEntity => ({
  id: `r-${x}-${y}`, type: "rectangle", corner1: { x, y }, corner2: { x: x + width, y: y + depth },
});
const circle = (x: number, y: number, radius: number): SketchEntity => ({ id: `c-${x}-${y}`, type: "circle", center: { x, y }, radius });

async function body(bodyId: string, entities: SketchEntity[], distance: number) {
  const result = await publishNamed(() => extrudeNamed({
    id: 1, kind: "extrude", entities, plane: "XY", planeOffset: 0, planeBasis: null, distance, direction: "one_side",
    extentType: "distance", backDistance: 0, offset: 0, operation: "new_body", targetBodyId: null, upToBodyId: null,
    upToFaceId: null, upToFacePoints: null, featureKey: `k-${bodyId}`,
  }, namedBodyShape));
  retainShape(result.shapeHandle, bodyId);
  return namedBodyShape(bodyId);
}

function pattern(bodyId: string, spec: PatternSpec, mode: PatternMode = "join", instance: number | null = null): NamedShape {
  return patternNamed({ id: 2, kind: "pattern", bodyId, featureKey: "k-pattern", pattern: spec, mode, instance }, namedBodyShape);
}

function linear(patch: Partial<Extract<PatternSpec, { type: "linear" }>> = {}): PatternSpec {
  return { type: "linear", axis: { kind: "x" }, count: 3, spacing: 20, axis2: null, count2: 1, spacing2: 10, ...patch };
}

function solidCount(named: NamedShape): number {
  const oc = getOC();
  const explorer = new oc.TopExp_Explorer(named.shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let count = 0;
  for (; explorer.More(); explorer.Next()) count++;
  explorer.delete();
  return count;
}

function edgeNameWhere(named: NamedShape, matches: (edge: Edge) => boolean): string {
  return withTopology(named.shape, (topology) => {
    const index = topology.edges.findIndex((shape) => {
      const edge = new Edge(getOC().TopoDS.Edge(shape));
      try {
        return matches(edge);
      } finally {
        edge.delete();
      }
    });
    return named.naming.edges[index];
  });
}

function faceNameWhere(named: NamedShape, matches: (face: Face) => boolean): string {
  return withTopology(named.shape, (topology) => {
    const index = topology.faces.findIndex((shape) => {
      const face = new Face(getOC().TopoDS.Face(shape));
      try {
        return matches(face);
      } finally {
        face.delete();
      }
    });
    return named.naming.faces[index];
  });
}

const bounds = (named: NamedShape) => named.shape.boundingBox.bounds;

describe("массив тел на реальном OCCT/WASM", () => {
  it("линейный массив без перекрытий объединяет копии в одно тело из отдельных солидов", async () => {
    const source = await body("pin", [rectangle(0, 0, 10, 4)], 2);
    const result = pattern("pin", linear());
    expect(measureVolume(result.shape)).toBeCloseTo(240, 6);
    expect(solidCount(result)).toBe(3);
    expect(bounds(result)[1][0]).toBeCloseTo(50, 6);
    expect(new Set(result.naming.faces).size).toBe(result.naming.faces.length);
    expect(result.naming.faces).toEqual(expect.arrayContaining(source.naming.faces));
    const again = pattern("pin", linear());
    expect([...again.naming.faces].sort()).toEqual([...result.naming.faces].sort());
    result.shape.delete();
    again.shape.delete();
  });

  it("перекрывающиеся копии сливаются в один солид", async () => {
    await body("bar", [rectangle(0, 0, 10, 4)], 2);
    const result = pattern("bar", linear({ spacing: 5 }));
    expect(solidCount(result)).toBe(1);
    expect(measureVolume(result.shape)).toBeCloseTo(20 * 4 * 2, 6);
    result.shape.delete();
  });

  it("сетка 2×2 цилиндров вычитается из плиты одной булевой операцией", async () => {
    await body("plate", [rectangle(0, 0, 60, 40)], 5);
    await body("foot", [circle(10, 10, 3)], 2);
    const feet = await publishNamed(() => pattern("foot", linear({ count: 2, spacing: 40, axis2: { kind: "y" }, count2: 2, spacing2: 20 })));
    retainShape(feet.shapeHandle, "feet");
    const plate = booleanNamed({ id: 3, kind: "boolean", operation: "subtract", targetBodyId: "plate", toolBodyId: "feet", featureKey: "k-cut" }, namedBodyShape);
    expect(measureVolume(plate.shape)).toBeCloseTo(60 * 40 * 5 - 4 * Math.PI * 9 * 2, 3);
    plate.shape.delete();
  });

  it("круговой массив вокруг оси Z расставляет копии по окружности", async () => {
    await body("tooth", [rectangle(20, -2, 6, 4)], 3);
    const result = pattern("tooth", { type: "circular", axis: { kind: "z" }, count: 4, angle: 360 });
    expect(measureVolume(result.shape)).toBeCloseTo(4 * 72, 6);
    const [min, max] = bounds(result);
    expect(min[0]).toBeCloseTo(-26, 6);
    expect(max[1]).toBeCloseTo(26, 6);
    result.shape.delete();
  });

  it("ось кругового массива берётся из цилиндрической грани другого тела", async () => {
    const hub = await body("hub", [circle(50, 50, 5)], 10);
    await body("blade", [rectangle(60, 49, 8, 2)], 1);
    const side = faceNameWhere(hub, (face) => face.geomType === "CYLINDRE");
    const result = pattern("blade", { type: "circular", axis: { kind: "face", bodyId: "hub", name: side }, count: 2, angle: 360 });
    const [min, max] = bounds(result);
    expect(min[0]).toBeCloseTo(32, 6);
    expect(max[0]).toBeCloseTo(68, 6);
    result.shape.delete();
  });

  it("направление линейного массива берётся из прямого ребра, кривое ребро отклоняется", async () => {
    const block = await body("block", [rectangle(0, 0, 10, 4)], 2);
    const alongY = edgeNameWhere(block, (edge) => edge.geomType === "LINE" && Math.abs(edge.endPoint.y - edge.startPoint.y) > 3);
    const result = pattern("block", linear({ axis: { kind: "edge", bodyId: "block", name: alongY }, count: 2, spacing: 10 }), "separate", 1);
    expect(Math.abs(bounds(result)[0][1])).toBeCloseTo(10, 6);
    result.shape.delete();
    const rod = await body("rod", [circle(0, 0, 2)], 4);
    const rim = edgeNameWhere(rod, (edge) => edge.geomType === "CIRCLE");
    expect(() => pattern("block", linear({ axis: { kind: "edge", bodyId: "rod", name: rim } }))).toThrow("прямое ребро");
  });

  it("отдельные тела строятся по одному экземпляру с разными именами граней", async () => {
    await body("cell", [rectangle(0, 0, 10, 4)], 2);
    const first = pattern("cell", linear(), "separate", 1);
    const second = pattern("cell", linear(), "separate", 2);
    expect(measureVolume(second.shape)).toBeCloseTo(80, 6);
    expect(bounds(second)[0][0]).toBeCloseTo(40, 6);
    expect(first.naming.faces.some((name) => second.naming.faces.includes(name))).toBe(false);
    expect(() => pattern("cell", linear(), "separate", 3)).toThrow("вне диапазона");
    first.shape.delete();
    second.shape.delete();
  });

  it("параллельные направления сетки и неверные параметры отклоняются", async () => {
    await body("dot", [rectangle(0, 0, 1, 1)], 1);
    expect(() => pattern("dot", linear({ axis2: { kind: "x" }, count2: 2 }))).toThrow("параллельно");
    expect(() => pattern("dot", linear({ count: 1 }))).toThrow("от 2");
  });

  it("пересборка истории строит массив с новым количеством", async () => {
    await body("peg", [rectangle(0, 0, 10, 4)], 2);
    const request = { kind: "pattern", featureKey: "k-pattern", bodyId: "peg", pattern: linear({ count: 4 }), mode: "join", instance: null };
    const result = await runRebuildRequest({
      id: 4, kind: "rebuild",
      steps: [{ entryId: "pa", kind: "pattern", outputBodyId: "pegs", inputBodyIds: ["peg"], request }],
    });
    expect(result.bodies.map((rebuilt) => rebuilt.bodyId)).toEqual(["pegs"]);
    retainShape(result.bodies[0].shapeHandle, "pegs");
    expect(measureVolume(namedBodyShape("pegs").shape)).toBeCloseTo(320, 6);
    releaseShape(undefined, "pegs");
  });
});
