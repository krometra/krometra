import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  binaryStlMetrics,
  bodyMetrics,
  boxFixture,
  buildFixture,
  expectBounds,
  expectMetrics,
  expectNear,
  expectSameShape,
  MESH_TOLERANCE,
  stepMetrics,
  TESSELLATION_DEFLECTION,
  type ShapeFixture,
} from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, rectangle, send, sendOk } from "./testing/workerHarness";
import { booleanRequest, loadQuietWorker } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const BOX = "xp-box";
const FAR = "xp-far";
const ROD = "xp-rod";
const HOLED = "xp-holed";
const ROD_RADIUS = 2;
const ROD_HEIGHT = 30;
const HOLE_RADIUS = 3;

const fixtures: Record<string, ShapeFixture> = {
  [BOX]: boxFixture([0, 0, 0], [20, 10, 10]),
  [FAR]: boxFixture([100, 0, 0], [110, 10, 10]),
  [ROD]: {
    volume: Math.PI * ROD_RADIUS ** 2 * ROD_HEIGHT,
    area: 2 * Math.PI * ROD_RADIUS ** 2 + 2 * Math.PI * ROD_RADIUS * ROD_HEIGHT,
    min: [3, 3, 0],
    max: [7, 7, 30],
    faces: 3,
    edges: 3,
  },
  [HOLED]: {
    volume: 2000 - Math.PI * HOLE_RADIUS ** 2 * 10,
    area: 1000 - 2 * Math.PI * HOLE_RADIUS ** 2 + 2 * Math.PI * HOLE_RADIUS * 10,
    min: [0, 0, 0],
    max: [20, 10, 10],
    faces: 7,
    edges: 15,
  },
};

const pair: ShapeFixture = {
  volume: 2000 + 1000,
  area: 1000 + 600,
  min: [0, 0, 0],
  max: [110, 10, 10],
  faces: 12,
  edges: 24,
  solids: 2,
};

beforeAll(async () => {
  await loadQuietWorker();
  await buildBody(extrudeRequest([rectangle("r", 0, 0, 20, 10)], "k-xp-box"), BOX);
  await buildBody(extrudeRequest([rectangle("q", 100, 0, 110, 10)], "k-xp-far"), FAR);
  await buildBody(extrudeRequest([circle("c", 5, 5, ROD_RADIUS)], "k-xp-rod", { distance: ROD_HEIGHT }), ROD);
  await buildBody(extrudeRequest([circle("h", 10, 5, HOLE_RADIUS)], "k-xp-holed", {
    planeOffset: 10, distance: -1, extentType: "through_all", operation: "cut", targetBodyId: BOX,
  }), HOLED);
}, 60_000);

async function exported(format: "step" | "stl", bodyIds: string[]): Promise<ArrayBuffer> {
  const reply = await sendOk({ kind: "export", format, bodyIds });
  if (!reply.file) throw new Error("Ядро не вернуло файл экспорта.");
  return reply.file;
}

describe("экспорт STEP: эталоны после повторного импорта (реальный OCCT/WASM)", () => {
  it.each([BOX, ROD, HOLED])("тело %s после экспорта и импорта сохраняет объём, габариты и топологию", async (bodyId) => {
    const file = await exported("step", [bodyId]);
    const restored = await stepMetrics(file);

    expectMetrics(restored, fixtures[bodyId]);
    expectSameShape(restored, bodyMetrics(bodyId), "STEP после импорта");
  });

  it("файл остаётся точным B-rep с аналитическими поверхностями, а не сеткой", async () => {
    const text = new TextDecoder().decode(await exported("step", [HOLED]));

    expect(text.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
    expect(text.match(/MANIFOLD_SOLID_BREP/g)).toHaveLength(1);
    expect(text.match(/CYLINDRICAL_SURFACE/g)).toHaveLength(1);
    expect(text.match(/ADVANCED_FACE/g)).toHaveLength(7);
  });

  it("несколько тел восстанавливаются из одного файла отдельными solid с суммарным объёмом", async () => {
    const file = await exported("step", [BOX, FAR]);

    expectMetrics(await stepMetrics(file), pair);
    expect(new TextDecoder().decode(file).match(/MANIFOLD_SOLID_BREP/g)).toHaveLength(2);
  });

  it("тело, восстановленное из экспортированного STEP, даёт точное пересечение с другим телом", async () => {
    const file = await exported("step", [BOX]);
    const restored = await sendOk({ kind: "hydrate", bodyId: "xp-restored", step: file, naming: null });

    expect(restored.mesh).toBeDefined();
    expectMetrics(bodyMetrics("xp-restored"), fixtures[BOX]);
    await buildBody(extrudeRequest([rectangle("o", 10, 0, 30, 10)], "k-xp-overlap", { planeOffset: 5 }), "xp-overlap");
    await buildFixture(booleanRequest("intersect", "xp-restored", "xp-overlap", "k-xp-common"), "xp-common", boxFixture([10, 0, 5], [20, 10, 10]));
  });
});

describe("экспорт STL: объём, габариты и нормали (реальный OCCT/WASM)", () => {
  it("брусок: точный объём и габариты, нормали наружу", async () => {
    const stl = binaryStlMetrics(await exported("stl", [BOX]));

    expect(stl.misdirectedNormals).toBe(0);
    expectNear(stl.volume, 2000, 1e-3, "объём STL");
    expectBounds(stl, fixtures[BOX], 1e-5, "габариты STL");
  });

  it.each([ROD, HOLED])("тело %s с цилиндрической гранью: объём и габариты в пределах допуска тесселяции", async (bodyId) => {
    const stl = binaryStlMetrics(await exported("stl", [bodyId]));
    const fixture = fixtures[bodyId];

    expect(stl.triangles).toBeGreaterThan(12);
    expect(stl.misdirectedNormals).toBe(0);
    expectNear(stl.volume, fixture.volume, fixture.volume * MESH_TOLERANCE, "объём STL");
    expectBounds(stl, fixture, TESSELLATION_DEFLECTION, "габариты STL");
  });

  it("несколько тел: суммарный объём и общий габарит", async () => {
    const stl = binaryStlMetrics(await exported("stl", [BOX, FAR]));

    expect(stl.misdirectedNormals).toBe(0);
    expectNear(stl.volume, pair.volume, 1e-3, "объём STL");
    expectBounds(stl, pair, 1e-5, "габариты STL");
  });
});

describe("экспорт: тело вне ядра (реальный OCCT/WASM)", () => {
  it.each<[string, string[]]>([
    ["единственное тело, которого нет в ядре", ["xp-missing"]],
    ["список, в котором одного тела нет в ядре", [BOX, "xp-missing"]],
  ])("отклоняет: %s, остальные тела не меняются", async (_name, bodyIds) => {
    for (const format of ["step", "stl"]) {
      const reply = await send({ kind: "export", format, bodyIds });

      expect(reply.ok).toBe(false);
      expect(reply.error).toMatch(/не загружено/);
      expect(reply.file).toBeUndefined();
    }
    for (const [bodyId, fixture] of Object.entries(fixtures)) expectMetrics(bodyMetrics(bodyId), fixture);
  });
});
