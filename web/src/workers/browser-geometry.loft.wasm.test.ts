import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatedFaceName } from "@/lib/browserNaming";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import type { SketchEntity } from "@/types/api";
import { bodyMetrics, buildFixture, expectFixture, expectMetrics, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, faceNames, rectangle, send, sendOk } from "./testing/workerHarness";
import { browserEntry, loadQuietWorker, rebuiltBodies } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadQuietWorker();
}, 60_000);

const HEIGHT = 30;

function section(entities: SketchEntity[], planeOffset: number) {
  return { entities, plane: "XY", planeOffset, planeBasis: null };
}

function loftRequest(sections: ReturnType<typeof section>[], featureKey: string, overrides: Record<string, unknown> = {}) {
  return { kind: "loft", sections, ruled: false, operation: "new_body", targetBodyId: null, featureKey, ...overrides };
}

const frustumVolume = (h: number, a1: number, a2: number) => (h / 3) * (a1 + a2 + Math.sqrt(a1 * a2));

const bigSquare = [rectangle("big", -10, -10, 10, 10)];
const smallSquare = [rectangle("small", -5, -5, 5, 5)];

const pyramidFixture: ShapeFixture = {
  volume: frustumVolume(HEIGHT, 400, 100),
  min: [-10, -10, 0],
  max: [10, 10, HEIGHT],
  faces: 6,
  edges: 12,
};

describe("лофт по профилям (реальный OCCT/WASM)", () => {
  it("квадрат 20x20 в квадрат 10x10 дает усеченную пирамиду", async () => {
    await buildFixture(loftRequest([section(bigSquare, 0), section(smallSquare, HEIGHT)], "k-lf-pyr"), "lf-pyr", pyramidFixture);
  });

  it("линейный лофт по двум профилям дает ту же пирамиду", async () => {
    await buildFixture(loftRequest([section(bigSquare, 0), section(smallSquare, HEIGHT)], "k-lf-pyr-ruled", { ruled: true }), "lf-pyr-ruled", pyramidFixture);
  });

  it("круг R10 в круг R5 дает усеченный конус", async () => {
    await buildFixture(loftRequest([section([circle("c1", 0, 0, 10)], 0), section([circle("c2", 0, 0, 5)], HEIGHT)], "k-lf-cone"), "lf-cone", {
      volume: frustumVolume(HEIGHT, Math.PI * 100, Math.PI * 25),
      min: [-10, -10, 0],
      max: [10, 10, HEIGHT],
      faces: 3,
      tolerance: 1e-4,
    });
  });

  it("называет боковые грани по сторонам первого профиля, торцы - start и end", async () => {
    const reply = await buildBody(loftRequest([section(bigSquare, 0), section(smallSquare, HEIGHT)], "k-lf-named"), "lf-named");
    const names = faceNames(reply);
    const expected = ["side:big.0", "side:big.1", "side:big.2", "side:big.3", "start", "end"].map((key) => generatedFaceName("k-lf-named", key));
    expect([...names].sort()).toEqual([...expected].sort());
    const again = await buildBody(loftRequest([section(bigSquare, 0), section(smallSquare, HEIGHT)], "k-lf-named"), "lf-named-again");
    expect([...faceNames(again)].sort()).toEqual([...names].sort());
  });

  it("строит переход от квадрата к кругу без запасных имен граней", async () => {
    const reply = await buildBody(loftRequest([section(bigSquare, 0), section([circle("round", 0, 0, 8)], HEIGHT)], "k-lf-morph"), "lf-morph");
    const metrics = bodyMetrics("lf-morph");
    expectMetrics(metrics, { volume: metrics.volume, min: [-10, -10, 0], max: [10, 10, HEIGHT] });
    expect(metrics.volume).toBeGreaterThan(Math.PI * 64 * HEIGHT);
    expect(metrics.volume).toBeLessThan(400 * HEIGHT);
    expect(faceNames(reply)).not.toContain(generatedFaceName("k-lf-morph", "n0"));
  });

  it("строит переход от круга к квадрату", async () => {
    await buildBody(loftRequest([section([circle("round", 0, 0, 8)], 0), section(bigSquare, HEIGHT)], "k-lf-morph-back"), "lf-morph-back");
    const metrics = bodyMetrics("lf-morph-back");
    expectMetrics(metrics, { volume: metrics.volume, min: [-10, -10, 0], max: [10, 10, HEIGHT] });
  });

  it("гладкий лофт через три профиля отличается от линейного", async () => {
    const sections = [section(bigSquare, 0), section(smallSquare, HEIGHT / 2), section([rectangle("top", -10, -10, 10, 10)], HEIGHT)];
    await buildFixture(loftRequest(sections, "k-lf-ruled3", { ruled: true }), "lf-ruled3", {
      volume: 2 * frustumVolume(HEIGHT / 2, 400, 100),
      min: [-10, -10, 0],
      max: [10, 10, HEIGHT],
      faces: 10,
    });
    const smooth = await buildBody(loftRequest(sections, "k-lf-smooth3"), "lf-smooth3");
    expect(smooth.ok).toBe(true);
    const metrics = bodyMetrics("lf-smooth3");
    expect(metrics.valid).toBe(true);
    expect(metrics.faces).toBe(6);
    expect(metrics.volume).toBeLessThan(2 * frustumVolume(HEIGHT / 2, 400, 100) - 100);
    expect(metrics.min[0]).toBeCloseTo(-10, 3);
  });

  it("вырезает лофт из бруска", async () => {
    await buildBody(extrudeRequest([rectangle("blk", -15, -15, 15, 15)], "k-lf-block", { distance: HEIGHT }), "lf-block");
    await buildFixture(
      loftRequest([section(bigSquare, 0), section(smallSquare, HEIGHT)], "k-lf-cut", { operation: "cut", targetBodyId: "lf-block" }),
      "lf-hollow",
      { volume: 900 * HEIGHT - frustumVolume(HEIGHT, 400, 100), min: [-15, -15, 0], max: [15, 15, HEIGHT], faces: 10 },
    );
  });

  it("приклеивает лофт к телу", async () => {
    await buildBody(extrudeRequest([rectangle("base", -12, -12, 12, 12)], "k-lf-base", { distance: 2, planeOffset: -2 }), "lf-base");
    await buildBody(
      loftRequest([section(bigSquare, 0), section(smallSquare, HEIGHT)], "k-lf-join", { operation: "join", targetBodyId: "lf-base" }),
      "lf-joined",
    );
    expectMetrics(bodyMetrics("lf-joined"), { volume: 576 * 2 + frustumVolume(HEIGHT, 400, 100), min: [-12, -12, -2], max: [12, 12, HEIGHT] });
  });

  it("объясняет, почему эскиз не годится в профиль", async () => {
    const twoRegions = [rectangle("a", -10, -10, -2, 10), rectangle("b", 2, -10, 10, 10)];
    const reply = await send(loftRequest([section(twoRegions, 0), section(smallSquare, HEIGHT)], "k-lf-two"));
    expect(reply.ok).toBe(false);
    expect(reply.error).toContain("замкнутых области");
  });
});

describe("пересборка лофта при правке профилей (реальный OCCT/WASM)", () => {
  const document: RebuildDocument = { components: {}, timeline: [] };

  beforeAll(async () => {
    await buildBody(loftRequest([section(bigSquare, 0), section(smallSquare, HEIGHT)], "k-lf-chain"), "lf-chain");
    document.components = {
      "s-bottom": { type: "sketch", plane: "XY", plane_offset: 0, entities: bigSquare },
      "s-top": { type: "sketch", plane: "XY", plane_offset: HEIGHT, entities: smallSquare },
    };
    document.timeline = [
      browserEntry({ id: "lf", kind: "loft", sketch_id: "s-bottom", body_id: "lf-chain", params: {
        profile_sketch_ids: ["s-bottom", "s-top"], transition: "smooth", operation: "new_body", feature_key: "k-lf-chain",
      } }),
    ];
  });

  async function rebuild(entryId: string, params: Record<string, unknown> = {}) {
    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, entryId, params) });
    const [body] = rebuiltBodies(reply);
    await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });
    return body;
  }

  it("новый верхний профиль перестраивает тело в усеченный конус", async () => {
    (document.components["s-top"] as { entities: SketchEntity[] }).entities = [rectangle("small", -2.5, -2.5, 2.5, 2.5)];
    const body = await rebuild("lf");
    await expectFixture("lf-chain", body, { volume: frustumVolume(HEIGHT, 400, 25), min: [-10, -10, 0], max: [10, 10, HEIGHT], faces: 6 });
  });

  it("смена перехода на линейный пересобирает тело", async () => {
    const body = await rebuild("lf", { transition: "ruled" });
    expect(body.bodyId).toBe("lf-chain");
    expectMetrics(bodyMetrics("lf-chain"), { volume: frustumVolume(HEIGHT, 400, 25), min: [-10, -10, 0], max: [10, 10, HEIGHT] });
  });
});
