import { beforeAll, describe, expect, it, vi } from "vitest";
import { measureVolume, setOC } from "replicad";
import type { SketchEntity } from "@/types/api";
import type { ExtrudeRequest } from "./types";
import { extrudeNamed } from "./extrude";
import { revolveNamed } from "./revolve";
import { bodyShape, namedBodyShape, publishNamed, retainShape, shapeMesh } from "./shapes";

vi.mock("./occt", () => ({ initOcct: () => Promise.resolve() }));

beforeAll(async () => {
  const { default: initOpenCascade } = await import("replicad-opencascadejs");
  const wasmPath = decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setOC(await initOpenCascade({ locateFile: () => wasmPath }));
}, 60_000);

const square = (x: number, size: number): SketchEntity => ({
  id: `square-${x}`, type: "rectangle", corner1: { x, y: 0 }, corner2: { x: x + size, y: size },
});
const circle = (x: number, radius: number): SketchEntity => ({
  id: `circle-${x}`, type: "circle", center: { x, y: 5 }, radius,
});

const wedge: SketchEntity[] = [
  { id: "wedge-base", type: "line", start: { x: 5, y: 0 }, end: { x: 10, y: 0 } },
  { id: "wedge-slope", type: "line", start: { x: 10, y: 0 }, end: { x: 5, y: 8 } },
  { id: "wedge-side", type: "line", start: { x: 5, y: 8 }, end: { x: 5, y: 0 } },
];

function widestXAtZ(bodyId: string, z: number): number {
  const { vertices } = shapeMesh(bodyShape(bodyId));
  let widest = 0;
  for (let i = 0; i < vertices.length; i += 3) {
    if (Math.abs(vertices[i + 2] - z) < 1e-6) widest = Math.max(widest, Math.abs(vertices[i]));
  }
  return widest;
}

let nextId = 1;
function extrude(patch: Partial<ExtrudeRequest>) {
  return publishNamed(() => extrudeNamed({
    id: nextId++, kind: "extrude", entities: [square(0, 10)], plane: "XY", planeOffset: 0, planeBasis: null,
    distance: 5, direction: "one_side", extentType: "distance", backDistance: 0, offset: 0,
    operation: "new_body", targetBodyId: null, upToBodyId: null, upToFaceId: null, upToFacePoints: null,
    featureKey: "k-test", ...patch,
  }, namedBodyShape));
}

async function retained(bodyId: string, patch: Partial<ExtrudeRequest>) {
  const result = await extrude(patch);
  retainShape(result.shapeHandle, bodyId);
  return measureVolume(bodyShape(bodyId));
}

describe("browser worker на реальном OCCT/WASM", () => {
  it("выдавливает несвязанные контуры одним телом", async () => {
    expect(await retained("pair", { entities: [square(0, 10), square(20, 10)] })).toBeCloseTo(1000, 3);
  });

  it("выдавливает в обе стороны на разные расстояния", async () => {
    const result = await extrude({ direction: "two_sided", backDistance: 3 });
    expect(result.mesh.bbox.min[2]).toBeCloseTo(-3);
    expect(result.mesh.bbox.max[2]).toBeCloseTo(5);
  });

  it("вырезает несколько отверстий насквозь одной операцией", async () => {
    await retained("plate", { entities: [square(0, 10), square(20, 10)] });
    const volume = await retained("holed", {
      entities: [circle(5, 2), circle(25, 2)], planeOffset: 5, distance: -1,
      extentType: "through_all", operation: "cut", targetBodyId: "plate",
    });
    expect(volume).toBeCloseTo(1000 - 2 * Math.PI * 4 * 5, 1);
  });

  it("доходит до грани и до тела со смещением", async () => {
    await retained("floor", {});
    const toFace = await extrude({ planeOffset: 20, extentType: "up_to_face", upToFacePoints: [[0, 0, 5], [10, 10, 5]] });
    expect(toFace.mesh.bbox.min[2]).toBeCloseTo(5);
    expect(toFace.mesh.bbox.max[2]).toBeCloseTo(20);
    const toBody = await extrude({ planeOffset: 20, distance: -1, extentType: "up_to_body", upToBodyId: "floor", offset: 1 });
    expect(toBody.mesh.bbox.min[2]).toBeCloseTo(4);
  });

  it("приклеивает до грани тела-цели", async () => {
    const base = await retained("base", {});
    const joined = await retained("joined", {
      entities: [square(2, 4)], planeOffset: 5, extentType: "up_to_face",
      upToFacePoints: [[0, 0, 12], [4, 4, 12]], operation: "join", targetBodyId: "base",
    });
    expect(joined - base).toBeCloseTo(16 * 7, 3);
  });

  it("отклоняет грань в плоскости эскиза", async () => {
    await expect(extrude({ extentType: "up_to_face", upToFacePoints: [[0, 0, 0], [1, 1, 0]] })).rejects.toThrow("в плоскости эскиза");
  });

  it("вращает несколько контуров одним телом", async () => {
    const result = await publishNamed(() => revolveNamed({
      id: nextId++, kind: "revolve", entities: [square(5, 2), square(10, 2)], plane: "XZ", planeOffset: 0,
      planeBasis: null, axisOrigin: { x: 0, y: 0 }, axis: "y", angle: 360, direction: "one_side", featureKey: "k-rings",
    }));
    retainShape(result.shapeHandle, "rings");
    const expected = Math.PI * 2 * ((7 ** 2 - 5 ** 2) + (12 ** 2 - 10 ** 2));
    expect(measureVolume(bodyShape("rings"))).toBeCloseTo(expected, 1);
  });

  it("вращает несимметричный профиль на XZ без зеркала: широкое основание остаётся внизу", async () => {
    const result = await publishNamed(() => revolveNamed({
      id: nextId++, kind: "revolve", entities: wedge, plane: "XZ", planeOffset: 0,
      planeBasis: null, axisOrigin: { x: 0, y: 0 }, axis: "y", angle: 360, direction: "one_side", featureKey: "k-wedge-revolve",
    }));
    retainShape(result.shapeHandle, "wedge-revolve");
    expect(widestXAtZ("wedge-revolve", 0)).toBeCloseTo(10, 3);
    expect(widestXAtZ("wedge-revolve", 8)).toBeCloseTo(5, 3);
  });

  it("выдавливает несимметричный профиль на XZ без зеркала", async () => {
    const volume = await retained("wedge-extrude", { entities: wedge, plane: "XZ", distance: 3 });
    expect(volume).toBeCloseTo(60, 3);
    expect(widestXAtZ("wedge-extrude", 0)).toBeCloseTo(10, 3);
    expect(widestXAtZ("wedge-extrude", 8)).toBeCloseTo(5, 3);
  });
});
