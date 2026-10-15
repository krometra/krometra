import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { RebuildCache, runRebuild, type RebuildBackend } from "./browserRebuildEngine";
import { browserRebuildPlan, browserRegenPlan, isBodyStep, type RebuildDocument } from "./browserRebuildPlan";

const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch, params: { ...patch.params, engine: "browser_wasm" },
});

function document(): RebuildDocument {
  return {
    components: {
      s1: { type: "sketch", plane: "XY", entities: [] },
      b1: { type: "body" }, b2: { type: "body" }, b3: { type: "body" }, b4: { type: "body" },
    },
    timeline: [
      entry({ id: "box", kind: "extrude", sketch_id: "s1", body_id: "b1", params: { distance: 10 } }),
      entry({ id: "fillet", kind: "fillet", body_id: "b2", params: { target_body_id: "b1", edge_ids: ["e-a"], radius: 1 } }),
      entry({ id: "chamfer", kind: "chamfer", body_id: "b3", params: { target_body_id: "b2", edge_ids: ["e-b"], distance1: 1, distance2: 1 } }),
      entry({ id: "side", kind: "extrude", sketch_id: "s1", body_id: "b4", params: { distance: 2 } }),
    ],
  };
}

function backend(failing: Set<string> = new Set()) {
  const built: string[] = [];
  const fake: RebuildBackend<string> = {
    build: (step, lookup) => {
      if (failing.has(step.entryId)) throw new Error(`${step.entryId} не строится`);
      const inputs = step.inputBodyIds.map(lookup).join(",");
      built.push(step.entryId);
      return `${step.entryId}(${inputs})`;
    },
    seat: (seat) => seat.placement,
    load: (bodyId) => `stored-${bodyId}`,
    revision: () => 0,
    dispose: () => undefined,
  };
  return { fake, built };
}

describe("browserRegenPlan", () => {
  it("подавленная операция становится псевдонимом своего входа, зависимые строятся от него", () => {
    const doc = document();
    doc.timeline[1] = { ...doc.timeline[1], suppressed: true };

    const steps = browserRegenPlan(doc, { roots: ["fillet"], bodies: [] });
    const { fake, built } = backend();
    const { shapes, failures } = runRebuild(steps, fake, new RebuildCache(10, fake.dispose));

    expect(steps.map((step) => step.kind)).toEqual(["alias", "chamfer"]);
    expect(built).toEqual(["chamfer"]);
    expect(shapes.get("b3")).toBe("chamfer(stored-b1)");
    expect(shapes.has("b2")).toBe(false);
    expect(failures).toEqual([]);
  });

  it("тело-корень, которого нет в документе, превращает зависимые в ошибки", () => {
    const doc = document();
    delete doc.components.b1;
    doc.timeline.splice(0, 1);

    const steps = browserRegenPlan(doc, { roots: [], bodies: ["b1"] });
    const { fake, built } = backend();
    const { shapes, failures } = runRebuild(steps, fake, new RebuildCache(10, fake.dispose));

    expect(steps[0]).toEqual({ kind: "alias", entryId: "", bodyId: "b1", fallbackBodyId: null });
    expect(built).toEqual([]);
    expect(shapes.size).toBe(0);
    expect(failures.map((failure) => failure.entryId)).toEqual(["fillet", "chamfer"]);
  });

  it("операция без эскиза не роняет план, а приходит шагом-ошибкой", () => {
    const doc = document();
    delete doc.components.s1;

    const steps = browserRegenPlan(doc, { roots: ["box", "side"], bodies: [] });
    const { fake } = backend();
    const { failures } = runRebuild(steps, fake, new RebuildCache(10, fake.dispose));

    expect(steps.filter(isBodyStep).map((step) => step.entryId)).toEqual(["fillet", "chamfer"]);
    expect(failures.map((failure) => failure.entryId)).toEqual(["box", "fillet", "chamfer", "side"]);
    expect(failures[0].message).toContain("Эскиз операции «box» не найден");
  });

  it("не построившаяся зависимая не останавливает пересборку: дальше строится от её входа", () => {
    const steps = browserRegenPlan(document(), { roots: ["fillet"], bodies: [] });
    const { fake } = backend(new Set(["fillet"]));
    const { shapes, failures } = runRebuild(steps, fake, new RebuildCache(10, fake.dispose));

    expect(failures).toEqual([{ entryId: "fillet", message: "fillet не строится" }]);
    expect(shapes.get("b3")).toBe("chamfer(stored-b1)");
  });

  it("изменённая операция обязана построиться: её ошибка отклоняет пересборку целиком", () => {
    const steps = browserRebuildPlan(document(), "fillet", { radius: 50 });
    const { fake } = backend(new Set(["fillet"]));

    expect(steps.find((step) => step.entryId === "fillet")).toMatchObject({ required: true });
    expect(() => runRebuild(steps, fake, new RebuildCache(10, fake.dispose))).toThrow("fillet не строится");
  });

  it("кеш различает вход, подменённый псевдонимом", () => {
    const { fake, built } = backend();
    const cache = new RebuildCache<string>(10, fake.dispose);
    runRebuild(browserRegenPlan(document(), { roots: ["chamfer"], bodies: [] }), fake, cache);
    const doc = document();
    doc.timeline[1] = { ...doc.timeline[1], suppressed: true };
    runRebuild(browserRegenPlan(doc, { roots: ["fillet"], bodies: [] }), fake, cache);

    expect(built).toEqual(["chamfer", "chamfer"]);
  });
});
