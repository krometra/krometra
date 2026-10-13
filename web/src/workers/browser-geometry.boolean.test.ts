import { beforeAll, describe, expect, it, vi } from "vitest";
import { bodyMetrics, boxFixture, buildFixture, expectMetrics, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, faceNames, rectangle, send } from "./testing/workerHarness";
import { booleanRequest, loadQuietWorker } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const targetFixture = boxFixture([0, 0, 0], [20, 10, 10]);
const sources: Record<string, string[]> = {};
const ROD_RADIUS = 3;
const HALF_ROD_VOLUME = 0.5 * Math.PI * ROD_RADIUS ** 2 * 10;
const HALF_ROD_CAP = 0.5 * Math.PI * ROD_RADIUS ** 2;
const HALF_ROD_WALL = Math.PI * ROD_RADIUS * 10;
const ROD_CHORD = 2 * ROD_RADIUS * 10;

async function source(bodyId: string, x1: number, x2: number, overrides: Record<string, unknown> = {}) {
  const reply = await buildBody(extrudeRequest([rectangle(`r-${bodyId}`, x1, 0, x2, 10)], `k-${bodyId}`, overrides), bodyId);
  sources[bodyId] = faceNames(reply);
}

beforeAll(async () => {
  await loadQuietWorker();
  await source("bl-target", 0, 20);
  await source("bl-overlap", 10, 30, { planeOffset: 5 });
  await source("bl-far", 100, 110);
  await source("bl-touching", 20, 30);
  await buildBody(extrudeRequest([rectangle("r-inner", 5, 2, 10, 8)], "k-bl-inner", { planeOffset: 2, distance: 5 }), "bl-inner");
  await buildBody(extrudeRequest([circle("c-rod", 20, 5, ROD_RADIUS)], "k-bl-rod"), "bl-rod");
}, 60_000);

let nextBody = 1;
async function combine(operation: "union" | "subtract" | "intersect", target: string, tool: string, expected: ShapeFixture) {
  const key = `bl-${nextBody++}`;
  return buildFixture(booleanRequest(operation, target, tool, `k-${key}`), key, expected);
}

describe("булевы операции пересекающихся тел (реальный OCCT/WASM)", () => {
  it("объединение складывает объёмы без общей части и сливает копланарные грани", async () => {
    const union = await combine("union", "bl-target", "bl-overlap", {
      volume: 2000 + 2000 - 500,
      area: 1000 + 1000 - 300 - 100,
      min: [0, 0, 0],
      max: [30, 10, 15],
      faces: 10,
      edges: 24,
    });

    const inherited = new Set([...sources["bl-target"], ...sources["bl-overlap"]]);
    expect(faceNames(union).filter((name) => !inherited.has(name.split("~")[0]))).toEqual([]);
  });

  it("вычитание оставляет Г-образную призму", async () => {
    await combine("subtract", "bl-target", "bl-overlap", {
      volume: 2000 - 500,
      area: 2 * 150 + (20 + 5 + 10 + 5 + 10 + 10) * 10,
      min: [0, 0, 0],
      max: [20, 10, 10],
      faces: 8,
      edges: 18,
    });
  });

  it("вычитание в обратном порядке оставляет вторую половину", async () => {
    await combine("subtract", "bl-overlap", "bl-target", {
      volume: 2000 - 500,
      area: 2 * 150 + (20 + 5 + 10 + 5 + 10 + 10) * 10,
      min: [10, 0, 5],
      max: [30, 10, 15],
      faces: 8,
      edges: 18,
    });
  });

  it("пересечение оставляет общий брусок", async () => {
    await combine("intersect", "bl-target", "bl-overlap", boxFixture([10, 0, 5], [20, 10, 10]));
  });

  it("пересечение бруска с цилиндром даёт половину цилиндра", async () => {
    await combine("intersect", "bl-target", "bl-rod", {
      volume: HALF_ROD_VOLUME,
      area: 2 * HALF_ROD_CAP + HALF_ROD_WALL + ROD_CHORD,
      min: [17, 2, 0],
      max: [20, 8, 10],
      faces: 4,
      edges: 6,
    });
  });

  it("вычитание цилиндра оставляет полукруглый паз, делящий торец на две грани", async () => {
    await combine("subtract", "bl-target", "bl-rod", {
      volume: 2000 - HALF_ROD_VOLUME,
      area: 1000 - 2 * HALF_ROD_CAP - ROD_CHORD + HALF_ROD_WALL,
      min: [0, 0, 0],
      max: [20, 10, 10],
      faces: 8,
      edges: 18,
    });
  });

  it("вычитание тела, лежащего целиком внутри, оставляет замкнутую полость", async () => {
    await combine("subtract", "bl-target", "bl-inner", {
      volume: 2000 - 5 * 6 * 5,
      area: 1000 + 2 * (5 * 6 + 6 * 5 + 5 * 5),
      min: [0, 0, 0],
      max: [20, 10, 10],
      faces: 12,
      edges: 24,
    });
  });

  it("объединение тел, касающихся гранью, сливается в один брусок", async () => {
    await combine("union", "bl-target", "bl-touching", boxFixture([0, 0, 0], [30, 10, 10]));
  });

  it("объединение тела с самим собой возвращает то же тело", async () => {
    await combine("union", "bl-target", "bl-target", targetFixture);
  });
});

describe("булевы операции непересекающихся тел (реальный OCCT/WASM)", () => {
  it("объединение даёт одно тело из двух solid с суммарным объёмом", async () => {
    await combine("union", "bl-target", "bl-far", {
      volume: 2000 + 1000,
      area: 1000 + 600,
      min: [0, 0, 0],
      max: [110, 10, 10],
      faces: 12,
      edges: 24,
      solids: 2,
    });
  });

  it("вычитание инструмента, не пересёкшего тело, возвращает цель без изменений и с прежними именами граней", async () => {
    const unchanged = await combine("subtract", "bl-target", "bl-far", targetFixture);

    expect(faceNames(unchanged).sort()).toEqual([...sources["bl-target"]].sort());
  });

  it.each<[string, "subtract" | "intersect", string, string]>([
    ["пересечение удалённых тел", "intersect", "bl-target", "bl-far"],
    ["пересечение тел, касающихся только гранью", "intersect", "bl-target", "bl-touching"],
    ["вычитание, съедающее цель целиком", "subtract", "bl-inner", "bl-target"],
    ["вычитание тела из самого себя", "subtract", "bl-target", "bl-target"],
  ])("пустой результат отклоняется: %s", async (_name, operation, target, tool) => {
    const reply = await send(booleanRequest(operation, target, tool, "k-bl-empty"));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/пуст/);
    expect(reply.shapeHandle).toBeUndefined();
  });

  it("тело, которого нет в ядре, отклоняется", async () => {
    const reply = await send(booleanRequest("union", "bl-target", "bl-missing", "k-bl-missing"));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/не загружено/);
  });

  it("исходные тела не меняются после всех операций", () => {
    expectMetrics(bodyMetrics("bl-target"), targetFixture);
    expectMetrics(bodyMetrics("bl-overlap"), boxFixture([10, 0, 5], [30, 10, 15]));
    expectMetrics(bodyMetrics("bl-far"), boxFixture([100, 0, 0], [110, 10, 10]));
  });
});
