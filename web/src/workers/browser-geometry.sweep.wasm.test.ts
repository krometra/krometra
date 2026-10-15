import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatedFaceName } from "@/lib/browserNaming";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import type { SketchEntity } from "@/types/api";
import { bodyMetrics, buildFixture, expectFixture, expectMetrics, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, faceNames, rectangle, send, sendOk } from "./testing/workerHarness";
import { arc, browserEntry, line, loadQuietWorker, rebuiltBodies } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadQuietWorker();
}, 60_000);

const RISE = 10;
const BEND = 10;
const square = [rectangle("sq", -1, -1, 1, 1)];
const riser = [line("up", 0, 0, 0, RISE)];
const elbow = [line("up", 0, 0, 0, RISE), arc("turn", BEND, RISE, BEND, Math.PI / 2, Math.PI)];

function sweepRequest(entities: SketchEntity[], pathEntities: SketchEntity[], featureKey: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: "sweep",
    entities,
    plane: "XY",
    planeOffset: 0,
    planeBasis: null,
    path: { entities: pathEntities, plane: "XZ", planeOffset: 0, planeBasis: null },
    orientation: "corrected",
    operation: "new_body",
    targetBodyId: null,
    featureKey,
    ...overrides,
  };
}

const ELBOW_LENGTH = RISE + (Math.PI / 2) * BEND;
const elbowFixture: ShapeFixture = {
  volume: 4 * ELBOW_LENGTH,
  area: 8 * ELBOW_LENGTH + 2 * 4,
  min: [-1, -1, 0],
  max: [BEND, 1, RISE + BEND + 1],
  faces: 10,
};

describe("протяжка по траектории (реальный OCCT/WASM)", () => {
  it("круг по прямому пути даёт цилиндр", async () => {
    await buildFixture(sweepRequest([circle("c", 0, 0, 2)], riser, "k-sw-rod"), "sw-rod", {
      volume: Math.PI * 4 * RISE,
      area: 2 * Math.PI * 4 + 2 * Math.PI * 2 * RISE,
      min: [-2, -2, 0],
      max: [2, 2, RISE],
      faces: 3,
      edges: 3,
    });
  });

  it("квадрат по отрезку и дуге даёт колено: объём и площадь по Паппу", async () => {
    await buildFixture(sweepRequest(square, elbow, "k-sw-elbow"), "sw-elbow", elbowFixture);
  });

  it("путь, нарисованный от дальнего конца, строит то же колено", async () => {
    const reversed = [arc("turn", BEND, RISE, BEND, Math.PI / 2, Math.PI), line("up", 0, RISE, 0, 0)];
    await buildFixture(sweepRequest(square, reversed, "k-sw-reversed"), "sw-reversed", elbowFixture);
  });

  it("называет все грани колена по сторонам профиля и торцам, без запасных имён", async () => {
    const reply = await buildBody(sweepRequest(square, elbow, "k-sw-named"), "sw-named");
    const names = faceNames(reply);
    expect(names).not.toContain(generatedFaceName("k-sw-named", "n0"));
    const outer = generatedFaceName("k-sw-named", "side:sq.1");
    expect(names).toEqual(expect.arrayContaining([outer, `${outer}~1`]));
    const again = await buildBody(sweepRequest(square, elbow, "k-sw-named"), "sw-named-again");
    expect([...faceNames(again)].sort()).toEqual([...names].sort());
  });

  it("режим Френе на плоском пути даёт то же тело", async () => {
    await buildFixture(sweepRequest(square, elbow, "k-sw-frenet", { orientation: "frenet" }), "sw-frenet", elbowFixture);
  });

  it("вырезает канал протяжкой из бруска", async () => {
    await buildBody(extrudeRequest([rectangle("blk", -5, -5, 5, 5)], "k-sw-block", { distance: 20 }), "sw-block");
    await buildFixture(
      sweepRequest([circle("ch", 0, 0, 1)], [line("ch-path", 0, 0, 0, 20)], "k-sw-cut", { operation: "cut", targetBodyId: "sw-block" }),
      "sw-channel",
      {
        volume: 100 * 20 - Math.PI * 20,
        area: 2 * (100 - Math.PI) + 40 * 20 + 2 * Math.PI * 20,
        min: [-5, -5, 0],
        max: [5, 5, 20],
        faces: 7,
      },
    );
  });

  it("приклеивает протяжку к телу", async () => {
    await buildBody(extrudeRequest([rectangle("base", -3, -3, 3, 3)], "k-sw-base", { distance: 2, planeOffset: -2 }), "sw-base");
    const reply = await buildBody(
      sweepRequest(square, riser, "k-sw-join", { operation: "join", targetBodyId: "sw-base" }),
      "sw-joined",
    );
    expect(reply.ok).toBe(true);
    expectMetrics(bodyMetrics("sw-joined"), { volume: 36 * 2 + 4 * RISE, min: [-3, -3, -2], max: [3, 3, RISE] });
  });

  it("объясняет, почему путь не подходит, и не строит тело", async () => {
    const away = await send(sweepRequest(square, [line("far", 0, 3, 0, 9)], "k-sw-away"));
    expect(away.ok).toBe(false);
    expect(away.error).toContain("не начинается в плоскости профиля");
    const flatPath = { entities: [line("flat", 0, 0, 5, 0)], plane: "XY", planeOffset: 0, planeBasis: null };
    const flat = await send(sweepRequest(square, [], "k-sw-flat", { path: flatPath }));
    expect(flat.error).toContain("вдоль плоскости профиля");
  });

  it("не принимает изгиб круче размера профиля", async () => {
    const tight = [line("up", 0, 0, 0, RISE), arc("turn", 0.5, RISE, 0.5, Math.PI / 2, Math.PI)];
    const reply = await send(sweepRequest(square, tight, "k-sw-tight"));
    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/пересекает само себя|не смогло протянуть/);
  });
});

describe("пересборка протяжки при правке эскизов (реальный OCCT/WASM)", () => {
  const document: RebuildDocument = { components: {}, timeline: [] };

  beforeAll(async () => {
    await buildBody(sweepRequest(square, riser, "k-sw-chain"), "sw-chain");
    document.components = {
      "s-profile": { type: "sketch", plane: "XY", plane_offset: 0, entities: square },
      "s-path": { type: "sketch", plane: "XZ", plane_offset: 0, entities: riser },
    };
    document.timeline = [
      browserEntry({ id: "sw", kind: "sweep", sketch_id: "s-profile", body_id: "sw-chain", params: {
        path_sketch_id: "s-path", orientation: "corrected", operation: "new_body", feature_key: "k-sw-chain",
      } }),
    ];
  });

  async function rebuild(entryId: string, params: Record<string, unknown> = {}) {
    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, entryId, params) });
    const [body] = rebuiltBodies(reply);
    await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });
    return body;
  }

  it("новый путь в эскизе пути перестраивает тело", async () => {
    (document.components["s-path"] as { entities: SketchEntity[] }).entities = elbow;
    const body = await rebuild("sw");
    await expectFixture("sw-chain", body, elbowFixture);
  });

  it("новый профиль в эскизе профиля перестраивает тело по тому же пути", async () => {
    (document.components["s-profile"] as { entities: SketchEntity[] }).entities = [rectangle("sq", -1, -1, 1, 1), rectangle("sq2", 2, -1, 3, 1)];
    const body = await rebuild("sw");
    const rib = 2 * RISE + (Math.PI / 4) * 2 * ((BEND - 2) ** 2 - (BEND - 3) ** 2);
    expect(body.bodyId).toBe("sw-chain");
    expectMetrics(bodyMetrics("sw-chain"), { min: elbowFixture.min, max: elbowFixture.max, volume: elbowFixture.volume + rib, solids: 2 });
  });
});
