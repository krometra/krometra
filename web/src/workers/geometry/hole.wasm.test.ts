import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatedFaceName } from "@/lib/browserNaming";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { holeParamsOf } from "@/lib/holeFeature";
import { countersinkDepth, DEFAULT_HOLE_SPEC, drillTipLength, type HoleSpec } from "@/lib/holeGeometry";
import type { Vec3 } from "@/lib/threadGeometry";
import { bodyMetrics, expectNames, expectStepRoundTrip } from "../testing/shapeFixture";
import { buildBody, circle, extrudeRequest, faceNames, rectangle, send, sendOk } from "../testing/workerHarness";
import { browserEntry, loadQuietWorker, rebuiltBodies } from "../testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const PLATE = "hole-plate";
const PLATE_KEY = "k-hole-plate";
const HEIGHT = 20;
const BOX_VOLUME = 40 * 20 * HEIGHT;
const plateSketch = [rectangle("r", 0, 0, 40, 20)];
const top = generatedFaceName(PLATE_KEY, "end:r.0");
const VOLUME_TOLERANCE = 1e-3;

const cylinder = (diameter: number, length: number) => Math.PI * (diameter / 2) ** 2 * length;
const cone = (diameter: number, length: number) => cylinder(diameter, length) / 3;
const frustum = (big: number, small: number, length: number) => (Math.PI * length * ((big / 2) ** 2 + (big / 2) * (small / 2) + (small / 2) ** 2)) / 3;

let nextBody = 1;

function spec(patch: Partial<HoleSpec>): HoleSpec {
  return { ...DEFAULT_HOLE_SPEC, ...patch };
}

function holeRequest(patch: Record<string, unknown>) {
  return {
    kind: "hole", bodyId: PLATE, faceId: top, facePoints: [], centers: [[10, 10, HEIGHT]] as Vec3[],
    entities: null, plane: "XY", planeOffset: 0, planeBasis: null, spec: DEFAULT_HOLE_SPEC, featureKey: "k-hole", ...patch,
  };
}

async function drilled(patch: Record<string, unknown>) {
  const bodyId = `hole-${nextBody++}`;
  const reply = await buildBody(holeRequest(patch), bodyId);
  return { bodyId, reply, metrics: bodyMetrics(bodyId) };
}

function expectRemoved(volume: number, removed: number) {
  expect(Math.abs(BOX_VOLUME - volume - removed)).toBeLessThan(removed * VOLUME_TOLERANCE);
}

beforeAll(async () => {
  await loadQuietWorker();
  await buildBody(extrudeRequest(plateSketch, PLATE_KEY, { distance: HEIGHT }), PLATE);
}, 60_000);

describe("отверстие на реальном OCCT/WASM", () => {
  it("простое отверстие с плоским дном вырезает цилиндр внутрь материала и называет стенку и дно", async () => {
    const { reply, metrics } = await drilled({ spec: spec({ diameter: 5, depth: 8 }) });

    expect(metrics.valid).toBe(true);
    expect(metrics.solids).toBe(1);
    expect(metrics.min).toEqual([0, 0, 0]);
    expect(metrics.max).toEqual([40, 20, HEIGHT]);
    expectRemoved(metrics.volume, cylinder(5, 8));
    expectNames(reply, metrics);
    expect(faceNames(reply)).toEqual(expect.arrayContaining([
      top,
      generatedFaceName("k-hole/h0", "wall"),
      generatedFaceName("k-hole/h0", "floor"),
    ]));
    await expectStepRoundTrip(reply.step, metrics);
  }, 60_000);

  it("дно-конус 118° добавляет к цилиндру конус сверла", async () => {
    const { reply, metrics } = await drilled({ spec: spec({ diameter: 6, depth: 8, bottom: "cone" }) });

    expectRemoved(metrics.volume, cylinder(6, 8) + cone(6, drillTipLength(6)));
    expect(faceNames(reply)).toContain(generatedFaceName("k-hole/h0", "tip"));
  }, 60_000);

  it("цековка — широкий стакан над основным отверстием", async () => {
    const hole = spec({ type: "counterbore", diameter: 5, depth: 12, cboreDiameter: 9, cboreDepth: 4 });
    const { reply, metrics } = await drilled({ spec: hole });

    expectRemoved(metrics.volume, cylinder(9, 4) + cylinder(5, 8));
    expect(metrics.faces).toBe(6 + 4);
    expect(faceNames(reply)).toEqual(expect.arrayContaining([
      generatedFaceName("k-hole/h0", "cbore-wall"),
      generatedFaceName("k-hole/h0", "cbore-floor"),
    ]));
  }, 60_000);

  it("зенковка — конус от диаметра зенковки к диаметру отверстия", async () => {
    const hole = spec({ type: "countersink", diameter: 5, depth: 12, csinkDiameter: 10, csinkAngle: 90 });
    const sink = countersinkDepth(hole);
    const { reply, metrics } = await drilled({ spec: hole });

    expectRemoved(metrics.volume, frustum(10, 5, sink) + cylinder(5, 12 - sink));
    expect(faceNames(reply)).toContain(generatedFaceName("k-hole/h0", "csink"));
  }, 60_000);

  it("насквозь — несколько отверстий одной операцией", async () => {
    const centers: Vec3[] = [[10, 10, HEIGHT], [30, 10, HEIGHT]];
    const { reply, metrics } = await drilled({ centers, spec: spec({ diameter: 4, extent: "through_all", bottom: "cone" }) });

    expect(metrics.valid).toBe(true);
    expectRemoved(metrics.volume, 2 * cylinder(4, HEIGHT));
    expect(faceNames(reply)).toEqual(expect.arrayContaining([
      generatedFaceName("k-hole/h0", "wall"),
      generatedFaceName("k-hole/h1", "wall"),
    ]));
  }, 60_000);

  it("берёт центры из окружностей эскиза и проецирует их на грань", async () => {
    const entities = [circle("a", 10, 10, 1), circle("b", 30, 10, 3)];
    const { metrics } = await drilled({ centers: [], entities, plane: "XY", planeOffset: 0, spec: spec({ diameter: 4, depth: 5 }) });

    expectRemoved(metrics.volume, 2 * cylinder(4, 5));
  }, 60_000);

  it("находит грань по точкам меша, если имя грани неизвестно", async () => {
    const facePoints: Vec3[] = [[0, 0, HEIGHT], [40, 20, HEIGHT], [20, 10, HEIGHT]];
    const { metrics } = await drilled({ faceId: "stale", facePoints, spec: spec({ diameter: 5, depth: 8 }) });

    expectRemoved(metrics.volume, cylinder(5, 8));
  }, 60_000);

  it("стенка отверстия годится под внутреннюю резьбу", async () => {
    const { bodyId } = await drilled({ spec: spec({ diameter: 8, depth: 15 }) });
    const reply = await sendOk({ kind: "thread-cylinder", bodyId, faceId: generatedFaceName("k-hole/h0", "wall"), facePoints: [] });

    expect(reply.cylindrical).toBe(true);
    expect(reply.cylinder).toMatchObject({ radius: 4, external: false });
  }, 60_000);

  it("пересборка после изменения высоты плиты сверлит то же отверстие по имени грани", async () => {
    const hole = spec({ diameter: 5, extent: "through_all" });
    await drilled({ spec: hole });
    const document: RebuildDocument = {
      components: { "s-plate": { type: "sketch", plane: "XY", plane_offset: 0, entities: plateSketch } },
      timeline: [
        browserEntry({ id: "e-plate", kind: "extrude", sketch_id: "s-plate", body_id: PLATE, params: { distance: HEIGHT, feature_key: PLATE_KEY } }),
        browserEntry({ id: "h-plate", kind: "hole", body_id: "hole-rebuilt", params: {
          target_body_id: PLATE, face_id: top, centers: [[10, 10, HEIGHT]], feature_key: "k-hole", ...holeParamsOf(hole),
        } }),
      ],
    };

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "e-plate", { distance: 30 }) });
    const bodies = rebuiltBodies(reply);
    for (const body of bodies) await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });
    const metrics = bodyMetrics("hole-rebuilt");

    expect(bodies.map((body) => body.bodyId)).toEqual([PLATE, "hole-rebuilt"]);
    expect(metrics.max[2]).toBeCloseTo(30);
    expect(Math.abs(40 * 20 * 30 - metrics.volume - cylinder(5, 30))).toBeLessThan(cylinder(5, 30) * VOLUME_TOLERANCE);
    expect(faceNames(bodies[1])).toContain(generatedFaceName("k-hole/h0", "wall"));
  }, 60_000);

  it("правка эскиза с окружностями переносит отверстия при пересборке", async () => {
    const hole = spec({ diameter: 4, depth: 5 });
    const document: RebuildDocument = {
      components: { "s-holes": { type: "sketch", plane: "XY", plane_offset: 0, entities: [circle("a", 30, 15, 1)] } },
      timeline: [browserEntry({ id: "h-sketch", kind: "hole", sketch_id: "s-holes", body_id: "hole-moved", params: {
        target_body_id: PLATE, face_id: top, centers: [[10, 10, HEIGHT]], feature_key: "k-hole", ...holeParamsOf(hole),
      } })],
    };

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "h-sketch", {}) });
    const [body] = rebuiltBodies(reply);
    await sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId });
    const metrics = bodyMetrics("hole-moved");

    expect(Math.abs(bodyMetrics(PLATE).volume - metrics.volume - cylinder(4, 5))).toBeLessThan(cylinder(4, 5) * VOLUME_TOLERANCE);
    expect(metrics.center[0]).toBeLessThan(20);
    expect(metrics.center[1]).toBeLessThan(10);
  }, 60_000);

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["центр вне грани", { centers: [[100, 100, HEIGHT]] }, /вне выбранной грани/],
    ["нет центров", { centers: [] }, /Не заданы центры/],
    ["цековка уже отверстия", { spec: spec({ type: "counterbore", cboreDiameter: 4 }) }, /Диаметр цековки/],
    ["зенковка глубже отверстия", { spec: spec({ type: "countersink", depth: 1, csinkDiameter: 20 }) }, /глубже самого отверстия/],
    ["боковая грань не та", { faceId: "stale", facePoints: [[100, 0, 0]] }, /не найдена/],
    ["тело, которого нет в ядре", { bodyId: "hole-missing" }, /не загружено/],
  ])("отклоняет: %s", async (_name, overrides, message) => {
    const reply = await send(holeRequest(overrides));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(message);
    expect(reply.shapeHandle).toBeUndefined();
  });
});
