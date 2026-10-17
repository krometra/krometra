import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { RebuildCache, runRebuild, type RebuildBackend } from "./browserRebuildEngine";
import { browserRebuildPlan, type RebuildDocument } from "./browserRebuildPlan";
import { sketchOwnerBody, type SketchSeatPlacement } from "./browserSketchSeat";
import { placementOfFrame } from "./workPlane";
import { workPlaneComponent } from "./workPlaneDocument";
import { reseatWorkPlane, workPlaneSeatSteps, type BodyGeometry, type WorkPlaneSeatStep } from "./workPlaneSeat";

const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});
const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });
const at = (height: number): SketchSeatPlacement => placementOfFrame({ origin: [0, 0, height], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });
const rectangle = { id: "r", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 5, y: 5 } };

function document(): RebuildDocument {
  const definition = { kind: "offset" as const, reference: { kind: "face" as const, bodyId: "b1", faceName: "f-top" }, distance: 5 };
  return {
    components: {
      s1: { plane: "XY", plane_offset: 0, entities: [rectangle] },
      p1: { ...workPlaneComponent("Плоскость 1", definition, at(15), {}), ref_body_id: null },
      s2: { plane: "XY", plane_offset: 15, plane_basis: at(15).planeBasis, ref_plane_id: "p1", entities: [rectangle] },
      b1: { type: "body" },
    },
    timeline: [
      entry({ id: "sk1", kind: "sketch", sketch_id: "s1" }),
      entry({ id: "e1", kind: "extrude", sketch_id: "s1", body_id: "b1", params: browser({ distance: 10, operation: "new_body", feature_key: "k1" }) }),
      entry({ id: "sk2", kind: "sketch", sketch_id: "s2", label: "Эскиз 2" }),
      entry({ id: "e2", kind: "extrude", sketch_id: "s2", body_id: "b2", params: browser({ distance: 3, operation: "new_body", feature_key: "k2" }) }),
    ],
  };
}

function withOwner(doc: RebuildDocument): RebuildDocument {
  return { ...doc, components: { ...doc.components, p1: { ...(doc.components.p1 as object), ref_body_id: "b1" } } };
}

const topAt = (height: number): BodyGeometry => ({
  face: () => ({ point: [3, 3, height], normal: [0, 0, 1] }),
  edge: () => ({ start: [0, 0, 0], end: [1, 0, 0], straight: true }),
});

describe("рабочая плоскость в пересборке", () => {
  it("операция от эскиза на плоскости зависит от тела-опоры плоскости", () => {
    const doc = withOwner(document());
    expect(sketchOwnerBody(doc, doc.timeline[3])).toBe("b1");
    expect(sketchOwnerBody(document(), document().timeline[3])).toBeNull();
  });

  it("план ставит шаг плоскости после тела-опоры и привязывает к нему эскиз", () => {
    const steps = browserRebuildPlan(withOwner(document()), "e1", { distance: 30 });
    expect(steps.map((step) => step.kind)).toEqual(["extrude", "work_plane", "extrude"]);
    const seat = steps[1] as WorkPlaneSeatStep;
    expect(seat).toMatchObject({ planeId: "p1", bodyId: "b1", seated: [{ sketchId: "s2", entryId: "sk2" }] });
    expect(steps[2]).toMatchObject({ entryId: "e2", sketchId: "s2" });
    expect(workPlaneSeatSteps(withOwner(document()), "b9")).toEqual([]);
  });

  it("плоскость без тела-опоры в пересборку не попадает", () => {
    expect(browserRebuildPlan(document(), "e1", { distance: 30 }).map((step) => step.entryId)).toEqual(["e1"]);
  });

  it("пересчитывает плоскость по перемещённой грани, сохраняя начало", () => {
    const [step] = workPlaneSeatSteps(withOwner(document()), "b1");
    const placement = reseatWorkPlane(step, topAt(30), () => undefined);
    expect(placement.planeOffset).toBe(35);
    expect(placement.planeBasis?.origin).toEqual([0, 0, 35]);
  });

  it("ошибку опоры подписывает названием плоскости", () => {
    const [step] = workPlaneSeatSteps(withOwner(document()), "b1");
    const broken: BodyGeometry = { ...topAt(0), face: () => { throw new Error("грань исчезла"); } };
    expect(() => reseatWorkPlane(step, broken, () => undefined)).toThrow("«Плоскость 1»: грань исчезла");
  });

  it("engine переносит эскиз за плоскостью и строит от него операцию; сбой плоскости помечает эскиз и операцию", () => {
    const built: string[] = [];
    const backend: RebuildBackend<string> = {
      build: (step) => {
        built.push(`${step.entryId}@${step.request.planeOffset}`);
        return step.entryId;
      },
      seat: (step) => step.placement,
      workPlane: (step, owner, seatOf) => {
        expect(owner).toBe("e1");
        return reseatWorkPlane(step, topAt(30), seatOf);
      },
      load: (bodyId) => bodyId,
      revision: () => 0,
      dispose: () => undefined,
    };
    const steps = browserRebuildPlan(withOwner(document()), "e1", { distance: 30 });
    const outcome = runRebuild(steps, backend, new RebuildCache(10, backend.dispose));
    expect(built).toEqual(["e1@0", "e2@35"]);
    expect([...outcome.seats.keys()]).toEqual(["p1", "s2"]);
    expect(outcome.failures).toEqual([]);

    const failing: RebuildBackend<string> = { ...backend, workPlane: () => { throw new Error("«Плоскость 1»: нет грани"); } };
    const failed = runRebuild(steps, failing, new RebuildCache(10, failing.dispose));
    expect(failed.failures.map((failure) => failure.entryId).sort()).toEqual(["e2", "p1", "sk2"]);
    expect(failed.shapes.has("b2")).toBe(false);
    expect(failed.seats.size).toBe(0);
  });
});
