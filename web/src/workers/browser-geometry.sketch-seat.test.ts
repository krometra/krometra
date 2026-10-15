import { beforeAll, describe, expect, it, vi } from "vitest";
import { measureVolume } from "replicad";
import { browserFacePlane, browserFacePoints } from "@/lib/browserFacePlane";
import { generatedFaceName } from "@/lib/browserNaming";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import type { TimelineEntry } from "@/types/api";
import { bodyShape } from "./geometry/shapes";
import { buildBody, circle, extrudeRequest, faceNames, loadWorker, rectangle, sendOk, type WorkerReply } from "./testing/workerHarness";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadWorker();
}, 60_000);

const box = [rectangle("r1", 0, 0, 20, 10)];
const bossProfile = [rectangle("b", 5, 2, 9, 6)];
const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });
const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});
const topBasis = (height: number) => ({ origin: [0, 0, height], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });

interface SeatedSketch {
  sketchId: string;
  plane: string;
  planeOffset: number;
  planeBasis: { origin: number[]; u: number[]; v: number[]; n: number[] };
}

function rebuilt(reply: WorkerReply) {
  return {
    bodies: reply.bodies as (WorkerReply & { bodyId: string })[],
    sketchPlanes: reply.sketchPlanes as SeatedSketch[],
  };
}

function failuresOf(reply: WorkerReply) {
  return reply.failures as { entryId: string; message: string }[];
}

async function retainAll(reply: WorkerReply) {
  await Promise.all(rebuilt(reply).bodies.map((body) => sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId })));
}

function bossDocument(prefix: string, boss: Record<string, unknown>): RebuildDocument {
  return {
    components: {
      s1: { type: "sketch", plane: "XY", plane_offset: 0, entities: box },
      s2: {
        type: "sketch", plane: "XY", plane_offset: 10, plane_basis: topBasis(10), entities: bossProfile,
        ref_body_id: `${prefix}-box`, ref_face_id: generatedFaceName(`k-${prefix}-box`, "end:r1.0"),
      },
    },
    timeline: [
      entry({ id: "e1", kind: "extrude", sketch_id: "s1", body_id: `${prefix}-box`, params: browser({ distance: 10, operation: "new_body", feature_key: `k-${prefix}-box` }) }),
      entry({ id: "sk2", kind: "sketch", sketch_id: "s2", label: "Эскиз 2" }),
      entry({ id: "e2", kind: "extrude", sketch_id: "s2", body_id: `${prefix}-boss`, params: browser({ distance: 5, feature_key: `k-${prefix}-boss`, ...boss }) }),
    ],
  };
}

describe("ассоциативный эскиз на грани (реальный OCCT/WASM)", () => {
  it("переносит приклеенную бобышку на новую высоту коробки", async () => {
    await buildBody(extrudeRequest(box, "k-sj-box"), "sj-box");
    await buildBody(extrudeRequest(bossProfile, "k-sj-boss", {
      planeOffset: 10, planeBasis: topBasis(10), distance: 5, operation: "join", targetBodyId: "sj-box",
    }), "sj-boss");
    expect(measureVolume(bodyShape("sj-boss"))).toBeCloseTo(20 * 10 * 10 + 4 * 4 * 5, 3);
    const document = bossDocument("sj", { operation: "join", target_body_id: "sj-box" });

    const steps = browserRebuildPlan(document, "e1", { distance: 30 });
    const reply = await sendOk({ kind: "rebuild", steps });
    const { bodies, sketchPlanes } = rebuilt(reply);
    await retainAll(reply);

    expect(steps.map((step) => step.kind)).toEqual(["extrude", "sketch_plane", "extrude"]);
    expect(sketchPlanes).toEqual([{ sketchId: "s2", plane: "XY", planeOffset: 30, planeBasis: topBasis(30) }]);
    const boss = bodies.find((body) => body.bodyId === "sj-boss");
    expect(boss?.mesh?.bbox.min).toEqual([0, 0, 0].map((value) => expect.closeTo(value, 6)));
    expect(boss?.mesh?.bbox.max).toEqual([20, 10, 35].map((value) => expect.closeTo(value, 6)));
    expect(measureVolume(bodyShape("sj-boss"))).toBeCloseTo(20 * 10 * 30 + 4 * 4 * 5, 3);
    expect(measureVolume(bodyShape("sj-box"))).toBeCloseTo(20 * 10 * 30, 3);
  });

  it("пересобирает отдельное тело от эскиза, хотя оно не берёт коробку на вход", async () => {
    await buildBody(extrudeRequest(box, "k-sn-box"), "sn-box");
    await buildBody(extrudeRequest(bossProfile, "k-sn-boss", { planeOffset: 10, planeBasis: topBasis(10), distance: 5 }), "sn-boss");
    const document = bossDocument("sn", { operation: "new_body" });

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "e1", { distance: 4 }) });
    const { bodies, sketchPlanes } = rebuilt(reply);
    await retainAll(reply);

    expect(sketchPlanes[0].planeBasis.origin).toEqual([0, 0, 4]);
    const boss = bodies.find((body) => body.bodyId === "sn-boss");
    expect(boss?.mesh?.bbox.min).toEqual([5, 2, 4].map((value) => expect.closeTo(value, 6)));
    expect(boss?.mesh?.bbox.max).toEqual([9, 6, 9].map((value) => expect.closeTo(value, 6)));
    expect(measureVolume(bodyShape("sn-boss"))).toBeCloseTo(4 * 4 * 5, 3);
  });

  it("оставляет плоскость прежней, если грань не сдвинулась", async () => {
    await buildBody(extrudeRequest(box, "k-ss-box"), "ss-box");
    const document = bossDocument("ss", { operation: "new_body" });
    document.timeline.pop();

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "e1", { direction: "one_side" }) });
    const { bodies, sketchPlanes } = rebuilt(reply);
    await Promise.all(bodies.map((body) => sendOk({ kind: "discard", shapeHandle: body.shapeHandle })));

    expect(bodies.map((body) => body.bodyId)).toEqual(["ss-box"]);
    expect(sketchPlanes).toEqual([{ sketchId: "s2", plane: "XY", planeOffset: 10, planeBasis: topBasis(10) }]);
  });

  it("поворачивает эскиз вместе с торцом вращения и помечает ошибкой, когда торец исчез", async () => {
    const profile = [rectangle("q", 5, 0, 7, 2)];
    const half = await buildBody({
      kind: "revolve", entities: profile, plane: "XZ", planeOffset: 0, planeBasis: null,
      axisOrigin: { x: 0, y: 0 }, axis: "y", angle: 180, direction: "one_side", featureKey: "k-sv-ring",
    }, "sv-ring");
    const cap = faceNames(half)
      .map((name) => ({ name, face: browserFacePlane(half.mesh!, name) }))
      .find(({ name, face }) => face && Math.abs(face.basis.n[1]) > 0.99 && browserFacePoints(half.mesh!, name, 1)[0][0] < 0);
    expect(cap?.face).toBeTruthy();
    const document: RebuildDocument = {
      components: {
        s1: { type: "sketch", plane: "XZ", plane_offset: 0, entities: profile },
        s2: {
          type: "sketch", plane: cap!.face!.plane, plane_offset: cap!.face!.planeOffset, plane_basis: cap!.face!.basis,
          entities: [circle("c", -6, -1, 0.5)], ref_body_id: "sv-ring", ref_face_id: cap!.name,
        },
      },
      timeline: [
        entry({ id: "r1", kind: "revolve", sketch_id: "s1", body_id: "sv-ring", params: browser({ axis_origin: { x: 0, y: 0 }, axis: "y", angle: 180, direction: "one_side", feature_key: "k-sv-ring" }) }),
        entry({ id: "sk2", kind: "sketch", sketch_id: "s2", label: "Эскиз 2" }),
        entry({ id: "e2", kind: "extrude", sketch_id: "s2", body_id: "sv-pin", params: browser({ distance: 3, operation: "new_body", feature_key: "k-sv-pin" }) }),
      ],
    };

    const turned = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "r1", { angle: 90 }) });
    await Promise.all(rebuilt(turned).bodies.map((body) => sendOk({ kind: "discard", shapeHandle: body.shapeHandle })));
    const lost = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "r1", { angle: 360 }) });
    await Promise.all(rebuilt(lost).bodies.map((body) => sendOk({ kind: "discard", shapeHandle: body.shapeHandle })));

    const [seat] = rebuilt(turned).sketchPlanes;
    expect(seat.plane).toBe("YZ");
    expect(seat.planeBasis.n).toEqual([-1, 0, 0].map((value) => expect.closeTo(value, 9)));
    expect(seat.planeBasis.v).toEqual([0, 0, -1].map((value) => expect.closeTo(value, 9)));
    const pin = rebuilt(turned).bodies.find((body) => body.bodyId === "sv-pin");
    expect(pin?.mesh?.bbox.min).toEqual([-3, 5.5, 0.5].map((value) => expect.closeTo(value, 2)));
    expect(pin?.mesh?.bbox.max).toEqual([0, 6.5, 1.5].map((value) => expect.closeTo(value, 2)));
    expect(rebuilt(lost).bodies.map((body) => body.bodyId)).toEqual(["sv-ring"]);
    expect(failuresOf(lost).map((failure) => failure.entryId)).toEqual(["sk2", "e2"]);
    expect(failuresOf(lost)[0].message).toContain("«Эскиз 2»: грань, на которой построен эскиз, исчезла");
  });

  it("помечает ошибкой эскиз, грань которого перестала быть плоской", async () => {
    const disc = [circle("c1", 0, 0, 5)];
    const cylinder = await buildBody(extrudeRequest(disc, "k-sc-rod"), "sc-rod");
    const side = faceNames(cylinder).find((name) => !browserFacePlane(cylinder.mesh!, name));
    const document: RebuildDocument = {
      components: {
        s1: { type: "sketch", plane: "XY", plane_offset: 0, entities: disc },
        s2: { type: "sketch", plane: "XY", plane_offset: 0, plane_basis: topBasis(0), entities: bossProfile, ref_body_id: "sc-rod", ref_face_id: side },
      },
      timeline: [
        entry({ id: "e1", kind: "extrude", sketch_id: "s1", body_id: "sc-rod", params: browser({ distance: 10, operation: "new_body", feature_key: "k-sc-rod" }) }),
        entry({ id: "sk2", kind: "sketch", sketch_id: "s2", label: "Эскиз 2" }),
      ],
    };

    const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, "e1", { distance: 20 }) });
    await Promise.all(rebuilt(reply).bodies.map((body) => sendOk({ kind: "discard", shapeHandle: body.shapeHandle })));

    expect(side).toBeTruthy();
    expect(rebuilt(reply).sketchPlanes).toEqual([]);
    expect(failuresOf(reply)).toEqual([{ entryId: "sk2", message: expect.stringContaining("перестала быть плоской") }]);
  });
});
