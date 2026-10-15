import { beforeAll, describe, expect, it, vi } from "vitest";
import { measureVolume, setOC } from "replicad";
import type { SketchEntity } from "@/types/api";
import { extrudeNamed } from "./extrude";
import { mirrorNamed, type MirrorRequest } from "./mirror";
import { faceByName, type NamedShape } from "./naming";
import { runRebuildRequest } from "./rebuild";
import { bodyShape, namedBodyShape, publishNamed, releaseShape, retainShape } from "./shapes";

vi.mock("./occt", () => ({ initOcct: () => Promise.resolve() }));

beforeAll(async () => {
  const { default: initOpenCascade } = await import("replicad-opencascadejs");
  const wasmPath = decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setOC(await initOpenCascade({ locateFile: () => wasmPath }));
}, 60_000);

const BOX: SketchEntity = { id: "sq", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 10, y: 4 } };
const ROD: SketchEntity = { id: "rod", type: "circle", center: { x: 0, y: 0 }, radius: 3 };

async function body(bodyId: string, entity: SketchEntity) {
  const result = await publishNamed(() => extrudeNamed({
    id: 1, kind: "extrude", entities: [entity], plane: "XY", planeOffset: 0, planeBasis: null, distance: 2,
    direction: "one_side", extentType: "distance", backDistance: 0, offset: 0, operation: "new_body",
    targetBodyId: null, upToBodyId: null, upToFaceId: null, upToFacePoints: null, featureKey: `k-${bodyId}`,
  }, namedBodyShape));
  retainShape(result.shapeHandle, bodyId);
  return namedBodyShape(bodyId);
}

function mirror(patch: Partial<MirrorRequest>): NamedShape {
  return mirrorNamed({ id: 2, kind: "mirror", bodyId: "box", plane: { kind: "base", plane: "YZ", offset: 0 }, merge: false, featureKey: "k-mirror", ...patch }, namedBodyShape);
}

function bounds(named: NamedShape) {
  return named.shape.boundingBox.bounds.map((corner) => corner.map((value) => Math.round(value * 1e6) / 1e6));
}

function faceAtX(named: NamedShape, x: number): string {
  const name = named.naming.faces.find((faceName) => {
    const face = faceByName(named, faceName);
    try {
      const center = face.center;
      try {
        return face.geomType === "PLANE" && Math.abs(center.x - x) < 1e-6;
      } finally {
        center.delete();
      }
    } finally {
      face.delete();
    }
  });
  if (!name) throw new Error(`Нет плоской грани при x = ${x}`);
  return name;
}

describe("зеркало тела на реальном OCCT/WASM", () => {
  it("отражает копию относительно базовой плоскости, не трогая исходное тело", async () => {
    const source = await body("box", BOX);
    const copy = mirror({});
    expect(measureVolume(copy.shape)).toBeCloseTo(80, 6);
    expect(bounds(copy)).toEqual([[-10, 0, 0], [0, 4, 2]]);
    expect(copy.naming.faces).toHaveLength(6);
    expect(copy.naming.faces.filter((name) => source.naming.faces.includes(name))).toEqual([]);
    expect(measureVolume(bodyShape("box"))).toBeCloseTo(80, 6);
    copy.shape.delete();
  });

  it("даёт копии одни и те же имена граней и рёбер при повторной сборке", async () => {
    await body("box", BOX);
    const first = mirror({});
    const second = mirror({});
    expect(second.naming).toEqual(first.naming);
    expect(mirror({ featureKey: "k-other" }).naming.faces).not.toEqual(first.naming.faces);
    first.shape.delete();
    second.shape.delete();
  });

  it("сдвигает базовую плоскость на смещение", async () => {
    await body("box", BOX);
    const copy = mirror({ plane: { kind: "base", plane: "XY", offset: 5 } });
    expect(bounds(copy)).toEqual([[0, 0, 8], [10, 4, 10]]);
    copy.shape.delete();
  });

  it("объединяет отражение с исходным телом в одно тело и сохраняет имена исходных граней", async () => {
    const source = await body("box", BOX);
    const merged = mirror({ merge: true });
    expect(measureVolume(merged.shape)).toBeCloseTo(160, 6);
    expect(bounds(merged)).toEqual([[-10, 0, 0], [10, 4, 2]]);
    expect(merged.naming.faces).toHaveLength(6);
    expect(merged.naming.faces).toContain(faceAtX(source, 10));
    expect(new Set(merged.naming.edges).size).toBe(merged.naming.edges.length);
    merged.shape.delete();
  });

  it("отражает относительно плоской грани тела", async () => {
    const source = await body("box", BOX);
    const copy = mirror({ plane: { kind: "face", faceId: faceAtX(source, 10) } });
    expect(bounds(copy)).toEqual([[10, 0, 0], [20, 4, 2]]);
    copy.shape.delete();
  });

  it("отказывает на неплоской грани", async () => {
    const rod = await body("rod", ROD);
    const side = rod.naming.faces.find((name) => {
      const face = faceByName(rod, name);
      try {
        return face.geomType !== "PLANE";
      } finally {
        face.delete();
      }
    });
    expect(() => mirror({ bodyId: "rod", plane: { kind: "face", faceId: side! } })).toThrow("плоской грани");
    expect(() => mirror({ plane: { kind: "face", faceId: "f-missing" } })).toThrow("больше не существует");
    releaseShape(undefined, "rod");
  });

  it("пересобирается из истории с новым положением плоскости", async () => {
    await body("box", BOX);
    const result = await runRebuildRequest({
      id: 3,
      kind: "rebuild",
      steps: [{
        entryId: "tl-mirror",
        kind: "mirror",
        outputBodyId: "box-mirror",
        inputBodyIds: ["box"],
        request: { kind: "mirror", featureKey: "k-mirror", bodyId: "box", plane: { kind: "base", plane: "YZ", offset: 20 }, merge: false },
      }],
    });
    expect(result.bodies.map((rebuilt) => rebuilt.bodyId)).toEqual(["box-mirror"]);
    expect(result.bodies[0].mesh.bbox).toEqual({ min: [30, 0, 0], max: [40, 4, 2] });
    result.bodies.forEach((rebuilt) => releaseShape(rebuilt.shapeHandle));
  });
});
