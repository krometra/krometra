import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RebuildPlanStep } from "@/lib/browserRebuildPlan";
import { deleteTimelineEntry, rollTimelineTo, setEntrySuppressed } from "@/lib/timelineEdits";
import type { Document, TimelineEntry } from "@/types/api";
import { RecordedCommand } from "./RecordedCommand";
import { TimelineEditCommand } from "./TimelineEditCommand";

const server = vi.hoisted(() => ({
  document: null as unknown as Document,
  regens: [] as { bodies: string[]; seeds: unknown }[],
  failing: new Set<string>(),
}));

vi.mock("@/composables/useApi", () => ({
  useApi: () => ({
    get: async () => JSON.parse(JSON.stringify(server.document)),
    put: async (_path: string, body: Document) => {
      if (body.version !== server.document.version) throw new Error("version_conflict");
      server.document = { ...server.document, ...body, version: body.version + 1 };
      return server.document;
    },
    multipartPost: async (_path: string, form: FormData) => {
      if (Number(form.get("document_version")) !== server.document.version) throw new Error("version_conflict");
      const document = JSON.parse(String(form.get("document")));
      server.regens.push({ bodies: JSON.parse(String(form.get("bodies"))), seeds: JSON.parse(String(form.get("seeds"))) });
      server.document = { ...server.document, ...document, version: server.document.version + 1 };
      return { bodies: [] };
    },
  }),
}));

vi.mock("@/composables/editor/useBrowserGeometry", () => ({
  rebuildBrowserHistory: async (steps: RebuildPlanStep[]) => {
    const failures = steps.filter((step) => server.failing.has(step.entryId)).map((step) => ({ entryId: step.entryId, message: "Не строится." }));
    const bodies = steps.flatMap((step) => ("outputBodyId" in step && step.kind !== "fail" && !server.failing.has(step.entryId)
      ? [{ bodyId: step.outputBodyId, shapeHandle: `h-${step.outputBodyId}`, step: new ArrayBuffer(1), mesh: {}, naming: {} }]
      : []));
    return { bodies, sketchPlanes: [], failures };
  },
  retainBrowserShape: async () => undefined,
  discardBrowserShape: async () => undefined,
  releaseBrowserShape: async () => undefined,
}));

const browser = (params: Record<string, unknown>) => ({ ...params, engine: "browser_wasm" });
const entry = (patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry => ({ timestamp: "", label: patch.id, status: "ok", ...patch });
const body = (visible: boolean) => ({ type: "body", visible, source: { kind: "browser_extrude" } });

function initialDocument(): Document {
  return {
    id: "d", project_id: "p", metadata: {}, version: 1, created_at: "", updated_at: "",
    components: { s1: { type: "sketch", plane: "XY", entities: [] }, b1: body(false), b2: body(false), b3: body(true) },
    timeline: [
      entry({ id: "box", kind: "extrude", sketch_id: "s1", body_id: "b1", params: browser({ distance: 10 }) }),
      entry({ id: "fillet", kind: "fillet", body_id: "b2", params: browser({ target_body_id: "b1", edge_ids: ["e-a"], radius: 1 }) }),
      entry({ id: "cut", kind: "chamfer", body_id: "b3", params: browser({ target_body_id: "b2", edge_ids: ["e-b"], distance1: 1, distance2: 1 }) }),
    ],
  } as unknown as Document;
}

const ids = () => server.document.timeline.map((item) => item.id);
const visible = () => Object.entries(server.document.components).filter(([, value]) => (value as { visible?: boolean }).visible === true).map(([id]) => id);

beforeEach(() => {
  server.document = initialDocument();
  server.regens = [];
  server.failing = new Set();
});

describe("TimelineEditCommand", () => {
  it("удаление пересобирает зависимые, а отмена возвращает операцию и пересобирает их снова", async () => {
    const command = new TimelineEditCommand("p", "Удалить fillet", (document) => deleteTimelineEntry(document, "fillet"));

    await command.execute();
    expect(ids()).toEqual(["box", "cut"]);
    expect(server.document.timeline[1].params?.target_body_id).toBe("b1");
    expect(server.regens[0].bodies).toEqual(["b3"]);

    await command.undo();
    expect(ids()).toEqual(["box", "fillet", "cut"]);
    expect(server.document.timeline[2].params?.target_body_id).toBe("b2");
    expect(server.regens[1].bodies).toEqual(["b2", "b3"]);

    await command.execute();
    expect(ids()).toEqual(["box", "cut"]);
    expect(server.regens[2].bodies).toEqual(["b3"]);
  });

  it("подавление с неудачной зависимой помечает её ошибкой и показывает вход", async () => {
    server.failing = new Set(["cut"]);
    await new TimelineEditCommand("p", "Подавить", (document) => setEntrySuppressed(document, "fillet", true)).execute();

    expect(server.document.timeline[1].suppressed).toBe(true);
    expect(server.document.timeline[2]).toMatchObject({ status: "error", error_message: "Не строится." });
    expect(server.regens[0].bodies).toEqual([]);
    expect(visible()).toEqual(["b1"]);
  });

  it("откат без пересборки сохраняет документ одной записью и прячет откаченные тела", async () => {
    await new TimelineEditCommand("p", "Откат", (document) => rollTimelineTo(document, 1)).execute();

    expect(server.regens).toEqual([]);
    expect(server.document.timeline.map((item) => item.rolled_back === true)).toEqual([false, true, true]);
    expect(visible()).toEqual(["b1"]);
  });
});

class AppendChamfer extends RecordedCommand {
  label = "Фаска";

  protected async perform(): Promise<void> {
    server.document = {
      ...server.document,
      version: server.document.version + 1,
      components: { ...server.document.components, b1: body(false), b9: body(true) },
      timeline: [...server.document.timeline, entry({ id: "new", kind: "chamfer", body_id: "b9", params: browser({ target_body_id: "b1", edge_ids: ["e-c"], distance1: 1, distance2: 1 }) })],
    };
  }
}

describe("новая операция при откаченной истории", () => {
  it("встаёт в точку маркера, откаченные перестраиваются поверх неё, отмена пересобирает их обратно", async () => {
    await new TimelineEditCommand("p", "Откат", (document) => rollTimelineTo(document, 1)).execute();
    const append = new AppendChamfer("p");

    await append.execute();
    expect(ids()).toEqual(["box", "new", "fillet", "cut"]);
    expect(server.document.timeline[2].params?.target_body_id).toBe("b9");
    expect(server.regens.at(-1)?.bodies).toEqual(["b2", "b3"]);

    await append.undo();
    expect(ids()).toEqual(["box", "fillet", "cut"]);
    expect(server.document.timeline[1].params?.target_body_id).toBe("b1");
    expect(server.regens.at(-1)?.bodies).toEqual(["b2", "b3"]);
  });
});
