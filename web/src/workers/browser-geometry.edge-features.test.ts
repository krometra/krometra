import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import { bodyMetrics, BOX_TOLERANCE, boxFixture, buildFixture, expectBounds, expectMetrics, expectNear, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, rectangle, send, type WorkerReply } from "./testing/workerHarness";
import { edgeBetween, loadQuietWorker } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const SIDE = 20;
const HALF = SIDE / 2;
const CUBE = "ef-cube";
const ROD = "ef-rod";
const POST = "ef-post";
const ROD_RADIUS = 5;
const ROD_HEIGHT = 10;
const cubeFixture = boxFixture([-HALF, -HALF, -HALF], [HALF, HALF, HALF]);
const cubeBounds = { min: cubeFixture.min, max: cubeFixture.max };
const rodBounds = { min: [-5, -5, 0] as Vector3, max: [5, 5, 10] as Vector3 };
const corners: [number, number][] = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];
const FILLET_GAP = 1 - Math.PI / 4;

let vertical: string[] = [];
let topLoop: string[] = [];
let allEdges: string[] = [];
let rim = "";
let abutting: string[] = [];

beforeAll(async () => {
  await loadQuietWorker();
  const cube = await buildBody(extrudeRequest([rectangle("r", -HALF, -HALF, HALF, HALF)], "k-ef-cube", { distance: SIDE, direction: "symmetric" }), CUBE);
  vertical = corners.map(([x, y]) => edgeBetween(cube, [x, y, -HALF], [x, y, HALF]));
  topLoop = corners.map(([x, y], index) => edgeBetween(cube, [x, y, HALF], [...corners[(index + 1) % 4], HALF]));
  const bottomLoop = corners.map(([x, y], index) => edgeBetween(cube, [x, y, -HALF], [...corners[(index + 1) % 4], -HALF]));
  allEdges = [...vertical, ...topLoop, ...bottomLoop];
  const rod = await buildBody(extrudeRequest([circle("c", 0, 0, ROD_RADIUS)], "k-ef-rod", { distance: ROD_HEIGHT }), ROD);
  rim = edgeBetween(rod, [ROD_RADIUS, 0, ROD_HEIGHT], [ROD_RADIUS, 0, ROD_HEIGHT]);
  await buildBody(extrudeRequest([rectangle("plate", 0, 0, 50, 50)], "k-ef-plate"), "ef-plate");
  const post = await buildBody(extrudeRequest([rectangle("post", 38, 30, 50, 50)], "k-ef-post", {
    planeOffset: 10, distance: 40, operation: "join", targetBodyId: "ef-plate",
  }), POST);
  abutting = [edgeBetween(post, [50, 30, 10], [50, 30, 50]), edgeBetween(post, [50, 0, 10], [50, 30, 10])];
}, 60_000);

let nextBody = 1;
function fillet(bodyId: string, edgeNames: string[], radius: number, expected: ShapeFixture) {
  const key = `ef-f${nextBody++}`;
  return buildFixture({ kind: "fillet", bodyId, featureKey: `k-${key}`, edgeNames, radius }, key, expected);
}

function chamfer(bodyId: string, edgeNames: string[], distance1: number, distance2: number, expected: ShapeFixture) {
  const key = `ef-c${nextBody++}`;
  return buildFixture({ kind: "chamfer", bodyId, featureKey: `k-${key}`, edgeNames, distance1, distance2 }, key, expected);
}

function straightFillet(count: number, radius: number): ShapeFixture {
  return {
    volume: SIDE ** 3 - count * FILLET_GAP * radius ** 2 * SIDE,
    area: 6 * SIDE ** 2 - count * (2 * radius * SIDE - (Math.PI / 2) * radius * SIDE + 2 * FILLET_GAP * radius ** 2),
    ...cubeBounds,
    faces: 6 + count,
    edges: 12 + 3 * count,
  };
}

function straightChamfer(count: number, distance1: number, distance2: number): ShapeFixture {
  const section = 0.5 * distance1 * distance2;
  return {
    volume: SIDE ** 3 - count * section * SIDE,
    area: 6 * SIDE ** 2 - count * ((distance1 + distance2) * SIDE - Math.hypot(distance1, distance2) * SIDE + 2 * section),
    ...cubeBounds,
    faces: 6 + count,
    edges: 12 + 3 * count,
  };
}

function roundedCube(radius: number): Pick<ShapeFixture, "volume" | "area"> {
  const core = SIDE - 2 * radius;
  return {
    volume: core ** 3 + 6 * core ** 2 * radius + 3 * Math.PI * radius ** 2 * core + (4 / 3) * Math.PI * radius ** 3,
    area: 6 * core ** 2 + 6 * Math.PI * radius * core + 4 * Math.PI * radius ** 2,
  };
}

function cutsAtFirstCorner(reply: WorkerReply): [number, number] {
  const vertices = reply.mesh?.vertices ?? [];
  let alongX = Infinity;
  let alongY = Infinity;
  for (let index = 0; index < vertices.length; index += 3) {
    const [x, y, z] = [vertices[index], vertices[index + 1], vertices[index + 2]];
    if (Math.abs(z - HALF) > 1e-6) continue;
    if (Math.abs(y + HALF) < 1e-6) alongX = Math.min(alongX, x + HALF);
    if (Math.abs(x + HALF) < 1e-6) alongY = Math.min(alongY, y + HALF);
  }
  return [alongX, alongY];
}

describe("скругление: эталоны (реальный OCCT/WASM)", () => {
  it("одно ребро: убирает зазор между квадратом и четвертью круга по длине ребра", async () => {
    await fillet(CUBE, [vertical[0]], 2, straightFillet(1, 2));
  });

  it("радиус в половину грани доводит касание до середины граней", async () => {
    await fillet(CUBE, [vertical[0]], HALF, straightFillet(1, HALF));
  });

  it("четыре параллельных ребра одной операцией", async () => {
    await fillet(CUBE, vertical, 3, straightFillet(4, 3));
  });

  it("замкнутый контур верхней грани сходится в углах под 45°", async () => {
    const radius = 2;
    const core = HALF - radius;
    await fillet(CUBE, topLoop, radius, {
      volume: SIDE ** 2 * (SIDE - radius) + 4 * core ** 2 * radius + 2 * Math.PI * core * radius ** 2 + (8 / 3) * radius ** 3,
      area: SIDE ** 2 + 4 * SIDE * (SIDE - radius) + (2 * core) ** 2 + 4 * (Math.PI * core * radius + 2 * radius ** 2),
      ...cubeBounds,
      faces: 10,
      edges: 20,
    });
  });

  it("все двенадцать рёбер дают куб, обкатанный шаром: шесть граней, двенадцать цилиндров, восемь сфер", async () => {
    await fillet(CUBE, allEdges, 2, { ...roundedCube(2), ...cubeBounds, faces: 26 });
  });

  it("круговое ребро цилиндра скругляется четвертью тора", async () => {
    const radius = 1;
    const inner = ROD_RADIUS - radius;
    const removed = 2 * Math.PI * (radius ** 2 * (ROD_RADIUS - radius / 2) - (Math.PI * radius ** 2 / 4) * (inner + (4 * radius) / (3 * Math.PI)));
    await fillet(ROD, [rim], radius, {
      volume: Math.PI * ROD_RADIUS ** 2 * ROD_HEIGHT - removed,
      area: Math.PI * ROD_RADIUS ** 2 + 2 * Math.PI * ROD_RADIUS * (ROD_HEIGHT - radius) + Math.PI * inner ** 2
        + 2 * Math.PI * radius * ((inner * Math.PI) / 2 + radius),
      ...rodBounds,
      faces: 4,
      edges: 5,
    });
  });

  it("стыкующиеся рёбра стойки и плиты не рвут тело: форма валидна, габарит не раздувается", async () => {
    const radius = 2;
    await buildBody({ kind: "fillet", bodyId: POST, featureKey: "k-ef-abutting", edgeNames: abutting, radius }, "ef-abutting");
    const filleted = bodyMetrics("ef-abutting");

    expect(filleted.valid).toBe(true);
    expect(filleted.solids).toBe(1);
    expectBounds(filleted, { min: [0, 0, 0], max: [50, 50, 50] }, BOX_TOLERANCE, "габариты");
    expectNear(filleted.volume, 34600 - FILLET_GAP * radius ** 2 * (40 + 30), radius ** 3, "объём без учёта стыка двух скруглений");
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["нулевой радиус", { radius: 0 }, /больше нуля/],
    ["отрицательный радиус", { radius: -1 }, /больше нуля/],
    ["нечисловой радиус", { radius: Number.NaN }, /больше нуля/],
    ["радиус больше грани", { radius: SIDE + 5 }, /не строится/],
    ["пустой набор рёбер", { edgeNames: [] }, /хотя бы одно ребро/],
    ["ребро, которого нет в теле", { edgeNames: ["e-missing"] }, /не существует/],
    ["тело, которого нет в ядре", { bodyId: "ef-missing" }, /не загружено/],
  ])("отклоняет: %s, тело остаётся прежним", async (_name, overrides, message) => {
    const reply = await send({ kind: "fillet", bodyId: CUBE, featureKey: "k-ef-rejected", edgeNames: [vertical[0]], radius: 2, ...overrides });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(message);
    expectMetrics(bodyMetrics(CUBE), cubeFixture);
  });
});

describe("фаска: эталоны (реальный OCCT/WASM)", () => {
  it("одно ребро с равными катетами срезает треугольную призму", async () => {
    await chamfer(CUBE, [vertical[0]], 2, 2, straightChamfer(1, 2, 2));
  });

  it("разные катеты ложатся на разные грани и меняются местами при перестановке", async () => {
    const first = await chamfer(CUBE, [vertical[0]], 2, 4, straightChamfer(1, 2, 4));
    const swapped = await chamfer(CUBE, [vertical[0]], 4, 2, straightChamfer(1, 2, 4));

    const [alongX, alongY] = cutsAtFirstCorner(first);
    expect([alongX, alongY].sort()).toEqual([2, 4]);
    expect(cutsAtFirstCorner(swapped)).toEqual([alongY, alongX]);
  });

  it("четыре параллельных ребра одной операцией", async () => {
    await chamfer(CUBE, vertical, 3, 3, straightChamfer(4, 3, 3));
  });

  it("круговое ребро цилиндра срезается конусом", async () => {
    const distance = 1;
    const inner = ROD_RADIUS - distance;
    await chamfer(ROD, [rim], distance, distance, {
      volume: Math.PI * ROD_RADIUS ** 2 * ROD_HEIGHT - Math.PI * distance ** 2 * (ROD_RADIUS - distance / 3),
      area: Math.PI * ROD_RADIUS ** 2 + 2 * Math.PI * ROD_RADIUS * (ROD_HEIGHT - distance) + Math.PI * inner ** 2
        + Math.PI * (ROD_RADIUS + inner) * distance * Math.SQRT2,
      ...rodBounds,
      faces: 4,
      edges: 5,
    });
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["нулевой катет", { distance1: 0 }, /больше нуля/],
    ["отрицательный второй катет", { distance2: -1 }, /больше нуля/],
    ["катет больше грани", { distance1: SIDE + 5, distance2: SIDE + 5 }, /фаску/],
    ["пустой набор рёбер", { edgeNames: [] }, /хотя бы одно ребро/],
  ])("отклоняет: %s, тело остаётся прежним", async (_name, overrides, message) => {
    const reply = await send({ kind: "chamfer", bodyId: CUBE, featureKey: "k-ef-rejected", edgeNames: [vertical[0]], distance1: 2, distance2: 2, ...overrides });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(message);
    expectMetrics(bodyMetrics(CUBE), cubeFixture);
  });
});

describe("слияние скруглений: эталоны (реальный OCCT/WASM)", () => {
  it("второе скругление пересобирается от родителя и совпадает с одной операцией на оба ребра", async () => {
    await buildBody({ kind: "fillet", bodyId: CUBE, featureKey: "k-ef-m1", edgeNames: [vertical[0]], radius: 3 }, "ef-m1");

    const merged = await buildFixture({
      kind: "fillet-merge",
      parentBodyId: CUBE,
      sources: [{ bodyId: CUBE, edgeNames: [vertical[0]] }, { bodyId: "ef-m1", edgeNames: [vertical[2]] }],
      radius: 3,
      featureKey: "k-ef-m1",
    }, "ef-m2", straightFillet(2, 3));

    expect(merged.edgeNames).toEqual([vertical[0], vertical[2]]);
  });

  it("двенадцатое ребро после одиннадцати даёт тот же обкатанный куб, что и одна операция", async () => {
    const radius = 5;
    await buildBody({ kind: "fillet", bodyId: CUBE, featureKey: "k-ef-m11", edgeNames: allEdges.slice(0, 11), radius }, "ef-m11");

    await buildFixture({
      kind: "fillet-merge",
      parentBodyId: CUBE,
      sources: [{ bodyId: CUBE, edgeNames: allEdges.slice(0, 11) }, { bodyId: "ef-m11", edgeNames: [allEdges[11]] }],
      radius,
      featureKey: "k-ef-m11",
    }, "ef-m12", { ...roundedCube(radius), ...cubeBounds, faces: 26 });
  });

  it("повтор уже скруглённого ребра не удваивает его в общем наборе", async () => {
    const merged = await buildFixture({
      kind: "fillet-merge",
      parentBodyId: CUBE,
      sources: [{ bodyId: CUBE, edgeNames: [vertical[0], vertical[1]] }, { bodyId: CUBE, edgeNames: [vertical[1]] }],
      radius: 3,
      featureKey: "k-ef-m-repeat",
    }, "ef-m-repeat", straightFillet(2, 3));

    expect(merged.edgeNames).toEqual([vertical[0], vertical[1]]);
  });

  it("ребро, которого нет ни на родителе, ни на теле-источнике, отклоняется", async () => {
    const reply = await send({
      kind: "fillet-merge",
      parentBodyId: CUBE,
      sources: [{ bodyId: CUBE, edgeNames: [vertical[0]] }, { bodyId: CUBE, edgeNames: ["e-missing"] }],
      radius: 3,
      featureKey: "k-ef-m-missing",
    });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/не существует/);
    expectMetrics(bodyMetrics(CUBE), cubeFixture);
  });
});
