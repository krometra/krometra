import { beforeAll, describe, expect, it, vi } from "vitest";
import { setOC } from "replicad";
import { QUALITY_PRESETS, meshTolerance, type MeshTolerance } from "@/lib/meshQuality";
import { THREE_MF_MODEL_PATH } from "@/lib/threeMf";
import { unzipForTests } from "@/lib/unzipForTests";
import type { SketchEntity } from "@/types/api";
import { estimateTriangles, exportBodies } from "./exportFile";
import { extrudeNamed } from "./extrude";
import { bodyShape, namedBodyShape, publishNamed, retainShape, shapeMesh } from "./shapes";
import type { ExportRequest } from "./types";

vi.mock("./occt", () => ({ initOcct: () => Promise.resolve() }));

beforeAll(async () => {
  const { default: initOpenCascade } = await import("replicad-opencascadejs");
  const wasmPath = decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setOC(await initOpenCascade({ locateFile: () => wasmPath }));
  await retained("exp-box", { id: "box", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 10, y: 10 } });
  await retained("exp-rod", { id: "rod", type: "circle", center: { x: 30, y: 5 }, radius: 5 });
}, 60_000);

const DRAFT = meshTolerance(QUALITY_PRESETS.draft);
const NORMAL = meshTolerance(QUALITY_PRESETS.normal);
const HIGH = meshTolerance(QUALITY_PRESETS.high);

let nextId = 1;
async function retained(bodyId: string, entity: SketchEntity) {
  const result = await publishNamed(() => extrudeNamed({
    id: nextId++, kind: "extrude", entities: [entity], plane: "XY", planeOffset: 0, planeBasis: null,
    distance: 8, direction: "one_side", extentType: "distance", backDistance: 0, offset: 0,
    operation: "new_body", targetBodyId: null, upToBodyId: null, upToFaceId: null, upToFacePoints: null,
    featureKey: `k-${bodyId}`,
  }, namedBodyShape));
  retainShape(result.shapeHandle, bodyId);
}

function exportFile(format: ExportRequest["format"], bodyIds: string[], mesh?: MeshTolerance, names?: string[]) {
  return exportBodies({ id: nextId++, kind: "export", format, bodyIds, mesh, names });
}

function estimate(bodyIds: string[], mesh: MeshTolerance) {
  return estimateTriangles({ id: nextId++, kind: "export-estimate", bodyIds, mesh });
}

async function stlTriangles(bodyIds: string[], mesh: MeshTolerance): Promise<number> {
  const file = await exportFile("stl", bodyIds, mesh);
  const count = new DataView(file).getUint32(80, true);
  expect(file.byteLength).toBe(84 + count * 50);
  return count;
}

describe("экспорт с качеством тесселяции на реальном OCCT/WASM", () => {
  it("грубее и точнее по пресетам, даже после сетки вьюпорта", async () => {
    const [draft, normal, high] = await Promise.all([DRAFT, NORMAL, HIGH].map((mesh) => stlTriangles(["exp-rod"], mesh)));
    expect(draft).toBeLessThan(normal);
    expect(normal).toBeLessThan(high);
  });

  it("оценка числа треугольников совпадает с STL", async () => {
    for (const mesh of [DRAFT, NORMAL, HIGH]) {
      expect(estimate(["exp-box", "exp-rod"], mesh)).toBe(await stlTriangles(["exp-box", "exp-rod"], mesh));
    }
  });

  it("экспорт не меняет сетку вьюпорта тела", async () => {
    const before = shapeMesh(bodyShape("exp-rod")).triangles.length;
    await stlTriangles(["exp-rod"], HIGH);
    await stlTriangles(["exp-rod"], DRAFT);
    expect(shapeMesh(bodyShape("exp-rod")).triangles.length).toBe(before);
  });

  it("3MF — валидный zip с моделью в мм и тем же числом треугольников, что STL", async () => {
    const file = await exportFile("3mf", ["exp-box", "exp-rod"], NORMAL, ["Коробка", "Стержень"]);
    const entries = await unzipForTests(new Uint8Array(file));
    expect(entries.map((entry) => entry.name)).toEqual(["[Content_Types].xml", "_rels/.rels", THREE_MF_MODEL_PATH]);
    const model = entries[2].text;
    expect(model).toContain('unit="millimeter"');
    expect(model.match(/<object /g)).toHaveLength(2);
    expect(model).toContain('name="Стержень"');
    expect(model.match(/<triangle /g)?.length).toBe(await stlTriangles(["exp-box", "exp-rod"], NORMAL));
  });

  it.each(["exp-box", "exp-rod"])("3MF %s — замкнутая сетка: каждое ребро ровно у двух треугольников", async (bodyId) => {
    const entries = await unzipForTests(new Uint8Array(await exportFile("3mf", [bodyId], NORMAL)));
    const edges = new Map<string, number>();
    for (const [, a, b, c] of entries[2].text.matchAll(/v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const key = [Number(p), Number(q)].sort((x, y) => x - y).join("-");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect(edges.size).toBeGreaterThan(0);
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
  });

  it("STEP не требует качества тесселяции", async () => {
    const text = new TextDecoder().decode(await exportFile("step", ["exp-box"]));
    expect(text.startsWith("ISO-10303-21")).toBe(true);
  });

  it("без качества сетка строится с нормальным допуском, как раньше", async () => {
    const file = await exportFile("stl", ["exp-rod"]);
    expect(new DataView(file).getUint32(80, true)).toBe(await stlTriangles(["exp-rod"], NORMAL));
  });
});
