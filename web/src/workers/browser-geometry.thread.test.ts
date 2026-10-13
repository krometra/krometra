import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatedFaceName } from "@/lib/browserNaming";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { isoDepth } from "@/lib/threadGeometry";
import { bodyMetrics, BOX_TOLERANCE, expectBounds, expectMesh, expectNames, expectNear, expectStepRoundTrip, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, send, sendOk, type WorkerReply } from "./testing/workerHarness";
import { browserEntry, loadQuietWorker, rebuiltBodies } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const ROD = "th-rod";
const ROD_KEY = "k-th-rod";
const RADIUS = 5;
const PITCH = 1.5;
const LENGTH = 3;
const FACETING_TOLERANCE = 0.02;
const rodSketch = [circle("c", 0, 0, RADIUS)];
const side = generatedFaceName(ROD_KEY, "side:c");
const cap = generatedFaceName(ROD_KEY, "end:c");
const options = { pitch: PITCH, depth: null, length: LENGTH, offset: 1.5, crestRatio: 0, starts: 1, rightHanded: true };
const depth = isoDepth(PITCH);
const grooveVolume = Math.PI * depth * (RADIUS - depth / 3) * LENGTH;

beforeAll(async () => {
  await loadQuietWorker();
  await buildBody(extrudeRequest(rodSketch, ROD_KEY, { distance: 8 }), ROD);
}, 60_000);

function threadedRod(height: number): ShapeFixture {
  return { volume: Math.PI * RADIUS ** 2 * height - grooveVolume, min: [-RADIUS, -RADIUS, 0], max: [RADIUS, RADIUS, height] };
}

async function expectThreadedRod(bodyId: string, reply: WorkerReply, height: number) {
  const expected = threadedRod(height);
  const metrics = bodyMetrics(bodyId);

  expect(metrics.valid).toBe(true);
  expect(metrics.solids).toBe(1);
  expectNear(Math.PI * RADIUS ** 2 * height - metrics.volume, grooveVolume, grooveVolume * FACETING_TOLERANCE, "объём канавки");
  expectBounds(metrics, expected, BOX_TOLERANCE, "габариты");
  expect(metrics.faces).toBeGreaterThan(3);
  expectNames(reply, metrics);
  expectMesh(reply, expected);
  await expectStepRoundTrip(reply.step, metrics);
}

describe("резьба через сообщения worker (реальный OCCT/WASM)", () => {
  it("описывает боковую грань стержня как внешний цилиндр с осью вдоль выдавливания", async () => {
    const reply = await sendOk({ kind: "thread-cylinder", bodyId: ROD, faceId: side, facePoints: [] });

    expect(reply.cylindrical).toBe(true);
    expect(reply.cylinder).toEqual({ radius: RADIUS, origin: [0, 0, 0], direction: [0, 0, 1], start: 0, length: 8, external: true });
  });

  it("на плоской грани сообщает, что резьба невозможна, без ошибки запроса", async () => {
    const reply = await sendOk({ kind: "thread-cylinder", bodyId: ROD, faceId: cap, facePoints: [] });

    expect(reply.cylindrical).toBe(false);
    expect(reply.reason).toMatch(/цилиндрической/);
  });

  it("два витка M10x1.5 снимают объём треугольного профиля, обёрнутого вокруг стержня", async () => {
    const reply = await buildBody({ kind: "thread", bodyId: ROD, faceId: side, facePoints: [], options, featureKey: "k-th-thread" }, "th-threaded");

    expect(reply.depth).toBeCloseTo(depth, 9);
    expect(reply.length).toBe(LENGTH);
    await expectThreadedRod("th-threaded", reply, 8);
  }, 60_000);

  it("пересборка после изменения высоты стержня нарезает ту же резьбу по имени грани", async () => {
    const document: RebuildDocument = {
      components: { "s-rod": { type: "sketch", plane: "XY", plane_offset: 0, entities: rodSketch } },
      timeline: [
        browserEntry({ id: "e-rod", kind: "extrude", sketch_id: "s-rod", body_id: ROD, params: { distance: 8, feature_key: ROD_KEY } }),
        browserEntry({ id: "t-rod", kind: "thread", body_id: "th-threaded", params: {
          target_body_id: ROD, face_id: side, pitch: PITCH, length: LENGTH, offset: 1.5, crest_ratio: 0, starts: 1, right_handed: true, feature_key: "k-th-thread",
        } }),
      ],
    };

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "e-rod", { distance: 10 }) });
    const bodies = rebuiltBodies(reply);
    for (const body of bodies) await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });

    expect(bodies.map((body) => body.bodyId)).toEqual([ROD, "th-threaded"]);
    await expectThreadedRod("th-threaded", bodies[1], 10);
  }, 60_000);

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["резьба длиннее грани", { options: { ...options, length: 50, offset: 0 } }, /больше длины цилиндрической грани/],
    ["резьба короче одного витка", { options: { ...options, length: 1 } }, /виток не поместится/],
    ["глубина не меньше радиуса стержня", { options: { ...options, depth: RADIUS } }, /срежет его целиком/],
    ["плоская грань", { faceId: cap }, /цилиндрической/],
    ["тело, которого нет в ядре", { bodyId: "th-missing" }, /не загружено/],
  ])("отклоняет: %s", async (_name, overrides, message) => {
    const reply = await send({ kind: "thread", bodyId: ROD, faceId: side, facePoints: [], options, featureKey: "k-th-rejected", ...overrides });

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(message);
    expect(reply.shapeHandle).toBeUndefined();
  });
});
