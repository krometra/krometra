import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { blockingEntries, deleteBody, type ModelDocument } from "./bodyHistory";
import { browserRegenPlan, browserRebuildPlan, inputBodiesOf, isBodyStep, type RebuildStep } from "./browserRebuildPlan";
import { deleteTimelineEntry, setEntrySuppressed } from "./timelineEdits";
import { consumedBodiesOf, outputFallbacks } from "./timelineFlags";
import { liveBodyIds } from "./timelineLiveness";

function entry(id: string, kind: TimelineEntry["kind"], extra: Partial<TimelineEntry> = {}): TimelineEntry {
  return { id, kind, label: id, status: "ok", timestamp: "", ...extra, params: { engine: "browser_wasm", ...extra.params } };
}

const body = (visible = true, source: Record<string, unknown> = {}) => ({ type: "body", visible, source: { kind: "browser_extrude", ...source } });
const sketch = (refBodyId?: string) => ({ plane: "XY", plane_offset: 10, entities: [], ...(refBodyId ? { ref_body_id: refBodyId } : {}) });

function combineDocument(keepTools: boolean): ModelDocument {
  return {
    components: {
      s1: sketch(), s2: sketch(), s3: sketch(),
      cube: body(false), rodA: body(keepTools), rodB: body(keepTools), result: body(true, { kind: "browser_boolean" }),
    },
    timeline: [
      entry("e-cube", "extrude", { sketch_id: "s1", body_id: "cube" }),
      entry("e-rodA", "extrude", { sketch_id: "s2", body_id: "rodA" }),
      entry("e-rodB", "extrude", { sketch_id: "s3", body_id: "rodB" }),
      entry("e-combine", "boolean", {
        operation: "subtract", target_body_id: "cube", tool_body_id: "rodA", tool_body_ids: ["rodA", "rodB"], result_body_id: "result",
        params: keepTools ? { keep_tools: true } : {},
      }),
    ],
  };
}

function cutDocument(): ModelDocument {
  return {
    components: {
      s1: sketch(), s2: sketch(), s3: sketch(), sc: sketch("barA"),
      barA: body(false), barB: body(false), far: body(true), cutA: body(true, { target_body_id: "barA" }), cutB: body(true, { target_body_id: "barB" }),
    },
    timeline: [
      entry("e-a", "extrude", { sketch_id: "s1", body_id: "barA" }),
      entry("e-b", "extrude", { sketch_id: "s2", body_id: "barB" }),
      entry("e-far", "extrude", { sketch_id: "s3", body_id: "far" }),
      entry("e-sc", "sketch", { sketch_id: "sc" }),
      entry("e-cut", "extrude", {
        sketch_id: "sc", body_id: "cutA", body_ids: ["cutA", "cutB"],
        params: { distance: -4, operation: "cut", target_body_id: "barA", target_body_ids: ["barA", "barB"] },
      }),
    ],
  };
}

const cutEntry = () => cutDocument().timeline[4];
const combineEntry = (keepTools: boolean) => combineDocument(keepTools).timeline[3];
const bodySteps = (steps: ReturnType<typeof browserRegenPlan>) => steps.filter(isBodyStep) as RebuildStep[];

describe("Combine с несколькими инструментами в истории", () => {
  it("вход операции — цель и все инструменты; поглощаются они же, если инструменты не сохраняют", () => {
    expect(inputBodiesOf(combineEntry(false))).toEqual(["cube", "rodA", "rodB"]);
    expect(consumedBodiesOf(combineEntry(false))).toEqual(["cube", "rodA", "rodB"]);
    expect(consumedBodiesOf(combineEntry(true))).toEqual(["cube"]);
  });

  it("сохранённые инструменты остаются живыми телами рядом с результатом", () => {
    expect([...liveBodyIds(combineDocument(false))].sort()).toEqual(["result"]);
    expect([...liveBodyIds(combineDocument(true))].sort()).toEqual(["result", "rodA", "rodB"]);
  });

  it("правка эскиза второго инструмента пересобирает операцию с полным списком инструментов", () => {
    const steps = bodySteps(browserRebuildPlan(combineDocument(false), "e-rodB", { distance: 12 }));
    expect(steps.map((step) => step.outputBodyId)).toEqual(["rodB", "result"]);
    expect(steps[1].request).toMatchObject({ kind: "boolean", targetBodyId: "cube", toolBodyIds: ["rodA", "rodB"] });
  });

  it("старая запись с одним tool_body_id читается как список из одного инструмента", () => {
    const legacy = entry("old", "boolean", { target_body_id: "a", tool_body_id: "b", result_body_id: "c", operation: "union" });
    expect(inputBodiesOf(legacy)).toEqual(["a", "b"]);
    const document = { components: { a: body(false), b: body(false), c: body() }, timeline: [legacy] };
    expect(bodySteps(browserRegenPlan(document, { roots: ["old"], bodies: [] }))[0].request).toMatchObject({ toolBodyIds: ["b"] });
  });

  it("удаление инструмента блокируется операцией, которая его использует", () => {
    const document = combineDocument(true);
    expect(blockingEntries(document, [document.timeline[2]]).map((item) => item.id)).toEqual(["e-combine"]);
    expect(() => deleteBody(document, "rodB", (item) => item.id)).toThrow("e-combine");
  });
});

describe("вырез по нескольким телам в истории", () => {
  it("у каждого результата свой исходник — цель с тем же номером", () => {
    expect(outputFallbacks(cutEntry())).toEqual([{ output: "cutA", fallback: "barA" }, { output: "cutB", fallback: "barB" }]);
    expect(consumedBodiesOf(cutEntry())).toEqual(["barA", "barB"]);
    expect(inputBodiesOf(cutEntry())).toEqual(["barA", "barB"]);
  });

  it("пересборка строит шаг на каждое тело с номером цели и подставляет исходник при подавлении", () => {
    const steps = bodySteps(browserRegenPlan(cutDocument(), { roots: ["e-cut"], bodies: [] }));
    expect(steps.map((step) => [step.outputBodyId, step.fallbackBodyId, step.request.instance])).toEqual([["cutA", "barA", 1], ["cutB", "barB", 2]]);
    expect(steps[1].request).toMatchObject({ kind: "extrude", operation: "cut", targetBodyIds: ["barA", "barB"] });
    const suppressed = setEntrySuppressed(cutDocument(), "e-cut", true).document;
    const aliases = browserRegenPlan(suppressed, { roots: ["e-cut"], bodies: [] }).filter((step) => step.kind === "alias");
    expect(aliases).toEqual([
      { kind: "alias", entryId: "e-cut", bodyId: "cutA", fallbackBodyId: "barA" },
      { kind: "alias", entryId: "e-cut", bodyId: "cutB", fallbackBodyId: "barB" },
    ]);
    expect([...liveBodyIds(suppressed)].sort()).toEqual(["barA", "barB", "far"]);
  });

  it("правка второго бруска пересобирает вырез: оба тела зависят от записи", () => {
    const steps = bodySteps(browserRegenPlan(cutDocument(), { roots: ["e-b"], bodies: [] }));
    expect(steps.map((step) => step.outputBodyId)).toEqual(["barB", "cutA", "cutB"]);
  });

  it("удаление выреза возвращает обе цели и переподключает поздние ссылки на свои исходники", () => {
    const document = cutDocument();
    document.timeline.push(entry("e-late", "fillet", { body_id: "late", params: { target_body_id: "cutB" } }));
    const { document: after, seeds } = deleteTimelineEntry(document, "e-cut");
    expect(after.components.cutA).toBeUndefined();
    expect(after.components.cutB).toBeUndefined();
    expect(after.timeline.find((item) => item.id === "e-late")?.params?.target_body_id).toBe("barB");
    expect(seeds.bodies).toEqual(["barA", "barB"]);
  });

  it("переподключение меняет и элемент списка целей", () => {
    const document = cutDocument();
    document.timeline.splice(4, 0, entry("e-fil", "fillet", { body_id: "barA2", params: { target_body_id: "barA" } }));
    document.timeline[5] = { ...document.timeline[5], params: { ...document.timeline[5].params, target_body_id: "barA2", target_body_ids: ["barA2", "barB"] } };
    const { document: after } = deleteTimelineEntry(document, "e-fil");
    expect(after.timeline.find((item) => item.id === "e-cut")?.params).toMatchObject({ target_body_id: "barA", target_body_ids: ["barA", "barB"] });
  });
});
