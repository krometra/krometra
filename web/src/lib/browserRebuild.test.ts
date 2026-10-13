import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { RebuildCache, runRebuild, type RebuildBackend } from "./browserRebuildEngine";
import { browserRebuildPlan, editableBrowserParams, isBodyStep, sketchRebuildRoots, type RebuildDocument, type RebuildStep } from "./browserRebuildPlan";

const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({
  timestamp: "", label: patch.id, status: "ok", ...patch,
});

const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });

function document(): RebuildDocument {
  return {
    components: {
      s1: { type: "sketch", plane: "XY", plane_offset: 2, entities: [{ id: "r", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 5, y: 5 } }] },
    },
    timeline: [
      entry({ id: "sk", kind: "sketch", sketch_id: "s1" }),
      entry({ id: "e1", kind: "extrude", sketch_id: "s1", body_id: "b1", params: browser({ distance: 10, direction: "one_side", operation: "new_body", feature_key: "k1" }) }),
      entry({ id: "e2", kind: "extrude", sketch_id: "s1", body_id: "b3", params: browser({ distance: 4, operation: "new_body" }) }),
      entry({ id: "f1", kind: "fillet", body_id: "b2", params: browser({ target_body_id: "b1", edge_ids: ["e-a"], radius: 1, feature_key: "kf" }) }),
      entry({ id: "bo", kind: "boolean", result_body_id: "b4", target_body_id: "b2", tool_body_id: "b3", operation: "union", params: browser({ feature_key: "kb" }) }),
    ],
  };
}

describe("browserRebuildPlan", () => {
  it("пересобирает изменённую операцию и только зависящие от неё", () => {
    const steps = browserRebuildPlan(document(), "e1", { distance: 20 }).filter(isBodyStep);

    expect(steps.map((step) => step.entryId)).toEqual(["e1", "f1", "bo"]);
    expect(steps[0].request).toMatchObject({ kind: "extrude", featureKey: "k1", distance: 20, planeOffset: 2, extentType: "distance" });
    expect(steps[1]).toMatchObject({ outputBodyId: "b2", inputBodyIds: ["b1"], request: { kind: "fillet", bodyId: "b1", edgeNames: ["e-a"], radius: 1 } });
    expect(steps[2]).toMatchObject({ outputBodyId: "b4", inputBodyIds: ["b2", "b3"], request: { operation: "union", targetBodyId: "b2", toolBodyId: "b3" } });
  });

  it("не трогает параллельную ветку и берёт ключ записи для старых операций", () => {
    const steps = browserRebuildPlan(document(), "e2", { distance: 8 }).filter(isBodyStep);

    expect(steps.map((step) => step.entryId)).toEqual(["e2", "bo"]);
    expect(steps[0].request.featureKey).toBe("e2");
  });

  it("отказывает, если от изменённой операции зависит серверная", () => {
    const doc = document();
    doc.timeline.push(entry({ id: "srv", kind: "chamfer", body_id: "b5", params: { target_body_id: "b4" } }));

    expect(() => browserRebuildPlan(doc, "e1", { distance: 3 })).toThrow("не поддерживает пересборку");
    expect(() => browserRebuildPlan(doc, "srv", {})).toThrow("только операцию браузерного ядра");
  });

  it("после правки эскиза пересобирает каждую независимую ветку один раз", () => {
    const doc = document();
    doc.timeline.push(entry({ id: "e3", kind: "extrude", sketch_id: "s1", body_id: "b5", params: browser({ distance: 2, operation: "join", target_body_id: "b4" }) }));

    expect(sketchRebuildRoots(doc, "s1")).toEqual(["e1", "e2"]);
  });

  it("знает редактируемые параметры операций", () => {
    expect(editableBrowserParams("fillet")).toEqual(["radius"]);
    expect(editableBrowserParams("boolean")).toEqual([]);
  });
});

function fakeBackend() {
  const built: string[] = [];
  const disposed: string[] = [];
  const revisions = new Map<string, number>();
  const backend: RebuildBackend<string> = {
    build: (step, lookup) => {
      built.push(step.entryId);
      return `${step.entryId}:${JSON.stringify(step.request)}(${step.inputBodyIds.map(lookup).join(",")})`;
    },
    seat: (seat) => seat.placement,
    load: (bodyId) => `stored-${bodyId}`,
    revision: (bodyId) => revisions.get(bodyId) ?? 0,
    dispose: (shape) => disposed.push(shape),
  };
  return { backend, built, disposed, revisions };
}

const step = (entryId: string, outputBodyId: string, inputBodyIds: string[], request: Record<string, unknown> = {}): RebuildStep => ({
  entryId, kind: "fillet", outputBodyId, inputBodyIds, request,
});

describe("runRebuild", () => {
  it("строит цепочку, передавая промежуточные тела дальше", () => {
    const { backend } = fakeBackend();
    const { shapes } = runRebuild([step("a", "b1", ["b0"]), step("b", "b2", ["b1"])], backend, new RebuildCache(10, backend.dispose));

    expect(shapes.get("b2")).toBe("b:{}(a:{}(stored-b0))");
  });

  it("берёт неизменившиеся шаги из кеша и пересчитывает зависимые", () => {
    const { backend, built } = fakeBackend();
    const cache = new RebuildCache<string>(10, backend.dispose);
    const chain = (radius: number) => [step("a", "b1", ["b0"], { radius }), step("b", "b2", ["b1"])];

    runRebuild(chain(1), backend, cache);
    runRebuild(chain(2), backend, cache);
    const back = runRebuild(chain(1), backend, cache);

    expect(built).toEqual(["a", "b", "a", "b"]);
    expect(back.hits).toBe(2);
  });

  it("считает изменённое сохранённое тело новым входом", () => {
    const { backend, built, revisions } = fakeBackend();
    const cache = new RebuildCache<string>(10, backend.dispose);

    runRebuild([step("a", "b1", ["b0"])], backend, cache);
    revisions.set("b0", 5);
    runRebuild([step("a", "b1", ["b0"])], backend, cache);

    expect(built).toEqual(["a", "a"]);
  });

  it("вытесняет старые тела, но не тела текущей пересборки", () => {
    const { backend, disposed } = fakeBackend();
    const cache = new RebuildCache<string>(1, backend.dispose);

    const { shapes } = runRebuild([step("a", "b1", ["b0"]), step("b", "b2", ["b1"])], backend, cache);
    runRebuild([step("c", "b3", ["b9"])], backend, cache);

    expect(shapes.size).toBe(2);
    expect(disposed).toHaveLength(2);
    expect(cache.size).toBe(1);
  });
});
