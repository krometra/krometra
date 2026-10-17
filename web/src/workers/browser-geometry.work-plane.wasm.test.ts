import { beforeAll, describe, expect, it, vi } from "vitest";
import { measureVolume } from "replicad";
import { generatedFaceName } from "@/lib/browserNaming";
import { browserRebuildPlan, type RebuildDocument } from "@/lib/browserRebuildPlan";
import { computeWorkPlaneFrame, placementOfFrame, type WorkPlaneDefinition } from "@/lib/workPlane";
import { workPlaneComponent } from "@/lib/workPlaneDocument";
import { meshEdgeLine, meshWorkPlaneGeometry } from "@/lib/workPlaneMesh";
import type { TimelineEntry } from "@/types/api";
import { bodyShape } from "./geometry/shapes";
import { buildBody, edgeNames, extrudeRequest, loadWorker, rectangle, sendOk, type WorkerReply } from "./testing/workerHarness";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadWorker();
}, 60_000);

const box = [rectangle("r1", 0, 0, 20, 10)];
const bossProfile = [rectangle("b", 2, 2, 6, 6)];
const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });
const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});

interface SeatedPlane {
  sketchId: string;
  plane: string;
  planeOffset: number;
  planeBasis: { origin: number[]; u: number[]; v: number[]; n: number[] };
}

async function rebuild(document: RebuildDocument, entryId: string, params: Record<string, unknown>) {
  const reply = await sendOk({ kind: "rebuild", steps: browserRebuildPlan(document, entryId, params) });
  const bodies = reply.bodies as (WorkerReply & { bodyId: string })[];
  await Promise.all(bodies.map((body) => sendOk({ kind: "retain", shapeHandle: body.shapeHandle, bodyId: body.bodyId })));
  return { bodies, planes: reply.sketchPlanes as SeatedPlane[], failures: reply.failures as { entryId: string; message: string }[] };
}

function planeDocument(prefix: string, definition: WorkPlaneDefinition, built: WorkerReply): RebuildDocument {
  const meshOf = (bodyId: string) => (bodyId === `${prefix}-box` ? built.mesh : undefined);
  const placement = placementOfFrame(computeWorkPlaneFrame(definition, meshWorkPlaneGeometry(meshOf, {})));
  const plane = workPlaneComponent("Плоскость 1", definition, placement, {});
  return {
    components: {
      s1: { plane: "XY", plane_offset: 0, entities: box },
      p1: plane,
      s2: { plane: plane.plane, plane_offset: plane.plane_offset, plane_basis: plane.plane_basis, ref_plane_id: "p1", entities: bossProfile },
      [`${prefix}-box`]: { type: "body" },
    },
    timeline: [
      entry({ id: "e1", kind: "extrude", sketch_id: "s1", body_id: `${prefix}-box`, params: browser({ distance: 10, operation: "new_body", feature_key: `k-${prefix}-box` }) }),
      entry({ id: "sk2", kind: "sketch", sketch_id: "s2", label: "Эскиз 2" }),
      entry({ id: "e2", kind: "extrude", sketch_id: "s2", body_id: `${prefix}-boss`, params: browser({ distance: 3, operation: "new_body", feature_key: `k-${prefix}-boss` }) }),
    ],
  };
}

describe("рабочая плоскость в пересборке (реальный OCCT/WASM)", () => {
  it("плоскость со смещением от торца коробки поднимается вместе с ним и переносит бобышку", async () => {
    const built = await buildBody(extrudeRequest(box, "k-wo-box"), "wo-box");
    const top = generatedFaceName("k-wo-box", "end:r1.0");
    const document = planeDocument("wo", { kind: "offset", reference: { kind: "face", bodyId: "wo-box", faceName: top }, distance: 5 }, built);
    expect((document.components.p1 as { plane_offset: number }).plane_offset).toBeCloseTo(15, 9);
    await buildBody(extrudeRequest(bossProfile, "k-wo-boss", {
      planeOffset: 15, planeBasis: (document.components.p1 as { plane_basis: unknown }).plane_basis, distance: 3,
    }), "wo-boss");

    const { bodies, planes, failures } = await rebuild(document, "e1", { distance: 30 });

    expect(failures).toEqual([]);
    expect(planes.map((plane) => plane.sketchId)).toEqual(["p1", "s2"]);
    expect(planes[0].planeOffset).toBeCloseTo(35, 6);
    expect(planes[1].planeBasis).toEqual(planes[0].planeBasis);
    const boss = bodies.find((body) => body.bodyId === "wo-boss");
    expect(boss?.mesh?.bbox.min).toEqual([2, 2, 35].map((value) => expect.closeTo(value, 6)));
    expect(boss?.mesh?.bbox.max).toEqual([6, 6, 38].map((value) => expect.closeTo(value, 6)));
    expect(measureVolume(bodyShape("wo-boss"))).toBeCloseTo(4 * 4 * 3, 3);
  });

  it("плоскость под 45° через верхнее ребро проходит через ребро и после пересборки", async () => {
    const built = await buildBody(extrudeRequest(box, "k-wa-box"), "wa-box");
    const edge = edgeNames(built).find((name) => {
      const line = meshEdgeLine(built.mesh!, name);
      return line?.straight && line.start[1] === 0 && line.end[1] === 0 && line.start[2] === 10 && line.end[2] === 10;
    });
    expect(edge).toBeTruthy();
    const definition: WorkPlaneDefinition = { kind: "angle", axis: { kind: "edge", bodyId: "wa-box", edgeName: edge! }, reference: { kind: "base", plane: "XY" }, angle: 45 };
    const document = planeDocument("wa", definition, built);
    document.timeline.pop();

    const { planes, failures } = await rebuild(document, "e1", { distance: 30 });

    expect(failures).toEqual([]);
    const basis = planes[0].planeBasis;
    const reach = (point: number[]) => point.reduce((sum, value, axis) => sum + (value - basis.origin[axis]) * basis.n[axis], 0);
    expect(reach([0, 0, 30])).toBeCloseTo(0, 6);
    expect(reach([20, 0, 30])).toBeCloseTo(0, 6);
    expect(Math.abs(basis.n[2])).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("помечает ошибкой эскиз на плоскости, если опорное ребро исчезло", async () => {
    const built = await buildBody(extrudeRequest(box, "k-wm-box"), "wm-box");
    const definition: WorkPlaneDefinition = { kind: "offset", reference: { kind: "face", bodyId: "wm-box", faceName: generatedFaceName("k-wm-box", "end:r1.0") }, distance: 1 };
    const document = planeDocument("wm", definition, built);
    document.components.p1 = { ...(document.components.p1 as object), definition: { ...definition, reference: { ...definition.reference, faceName: "f-missing" } } };

    const { planes, failures } = await rebuild(document, "e1", { distance: 12 });

    expect(planes).toEqual([]);
    expect(failures.map((failure) => failure.entryId).sort()).toEqual(["e2", "p1", "sk2"]);
    expect(failures[0].message).toContain("Плоскость 1");
  });
});
