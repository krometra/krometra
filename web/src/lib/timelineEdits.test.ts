import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { HistoryEditError, type ModelDocument } from "./bodyHistory";
import {
  deleteRolledBack,
  deleteTimelineEntry,
  placeAtRollbackMarker,
  rollTimelineTo,
  setEntrySuppressed,
  sketchDependents,
} from "./timelineEdits";
import { fallbackBodyOf, isActiveEntry, rollbackIndex } from "./timelineFlags";

function entry(id: string, kind: TimelineEntry["kind"], extra: Partial<TimelineEntry> = {}): TimelineEntry {
  return { id, kind, label: id, status: "ok", timestamp: "", ...extra };
}

const body = (source: Record<string, unknown> = {}, visible = true) => ({ type: "body", visible, source: { kind: "browser_extrude", ...source } });
const sketch = (refBodyId?: string) => ({ plane: "XY", entities: [], ...(refBodyId ? { ref_body_id: refBodyId, ref_face_id: "f-top" } : {}) });

function document(): ModelDocument {
  return {
    components: {
      s1: sketch(), s2: sketch("b2"),
      b1: body({}, false), b2: body({ target_body_id: "b1" }, false), b3: body({ target_body_id: "b2" }), b4: body({ target_body_id: "b2" }),
    },
    timeline: [
      entry("t-s1", "sketch", { sketch_id: "s1" }),
      entry("t-box", "extrude", { sketch_id: "s1", body_id: "b1" }),
      entry("t-fillet", "fillet", { body_id: "b2", params: { target_body_id: "b1" } }),
      entry("t-s2", "sketch", { sketch_id: "s2" }),
      entry("t-cut", "extrude", { sketch_id: "s2", body_id: "b3", params: { operation: "cut", target_body_id: "b2" } }),
      entry("t-up", "extrude", { sketch_id: "s1", body_id: "b4", params: { up_to_body_id: "b2" } }),
    ],
  };
}

describe("timelineFlags", () => {
  it("операция неактивна, если подавлена, откачена или не построилась", () => {
    expect(isActiveEntry(entry("a", "extrude"))).toBe(true);
    expect(isActiveEntry(entry("a", "extrude", { suppressed: true }))).toBe(false);
    expect(isActiveEntry(entry("a", "extrude", { rolled_back: true }))).toBe(false);
    expect(isActiveEntry(entry("a", "extrude", { status: "error" }))).toBe(false);
  });

  it("запасное тело — цель операции, у булевой — тело-цель, у нового тела его нет", () => {
    expect(fallbackBodyOf(entry("a", "fillet", { params: { target_body_id: "b1" } }))).toBe("b1");
    expect(fallbackBodyOf(entry("a", "boolean", { target_body_id: "t", tool_body_id: "u" }))).toBe("t");
    expect(fallbackBodyOf(entry("a", "extrude"))).toBeNull();
  });

  it("маркер отката стоит перед первой откаченной записью", () => {
    expect(rollbackIndex([entry("a", "extrude"), entry("b", "extrude", { rolled_back: true })])).toBe(1);
    expect(rollbackIndex([entry("a", "extrude")])).toBe(1);
  });
});

describe("deleteTimelineEntry", () => {
  it("переводит зависимые операции и эскизы на исходное тело удалённой операции", () => {
    const { document: next, seeds, restoreSeeds } = deleteTimelineEntry(document(), "t-fillet");

    expect(next.timeline.map((item) => item.id)).not.toContain("t-fillet");
    expect(next.components.b2).toBeUndefined();
    expect(next.timeline.find((item) => item.id === "t-cut")?.params?.target_body_id).toBe("b1");
    expect(next.timeline.find((item) => item.id === "t-up")?.params?.up_to_body_id).toBe("b1");
    expect(next.components.s2).toMatchObject({ ref_body_id: "b1" });
    expect(next.components.b3).toMatchObject({ source: { target_body_id: "b1" } });
    expect(seeds).toEqual({ roots: [], bodies: ["b1"] });
    expect(restoreSeeds).toEqual({ roots: ["t-fillet"], bodies: ["b1"] });
  });

  it("у операции без исходного тела зависимые остаются на удалённом теле — пересборка пометит их ошибкой", () => {
    const { document: next, seeds } = deleteTimelineEntry(document(), "t-box");

    expect(next.components.b1).toBeUndefined();
    expect(next.timeline.find((item) => item.id === "t-fillet")?.params?.target_body_id).toBe("b1");
    expect(seeds).toEqual({ roots: [], bodies: ["b1"] });
  });

  it("удаляет эскиз и пересобирает операции от него", () => {
    const original = document();
    expect(sketchDependents(original, "t-s1").map((item) => item.id)).toEqual(["t-box", "t-up"]);

    const { document: next, seeds } = deleteTimelineEntry(original, "t-s1");

    expect(next.components.s1).toBeUndefined();
    expect(next.timeline.map((item) => item.id)).not.toContain("t-s1");
    expect(seeds).toEqual({ roots: ["t-box", "t-up"], bodies: [] });
  });

  it("сообщает о несуществующей записи", () => {
    expect(() => deleteTimelineEntry(document(), "nope")).toThrow(HistoryEditError);
  });
});

describe("setEntrySuppressed", () => {
  it("ставит и снимает флаг, пересобирая от самой операции", () => {
    const suppressed = setEntrySuppressed(document(), "t-fillet", true);
    expect(suppressed.document.timeline[2].suppressed).toBe(true);
    expect(suppressed.seeds).toEqual({ roots: ["t-fillet"], bodies: [] });

    const restored = setEntrySuppressed(suppressed.document, "t-fillet", false);
    expect("suppressed" in restored.document.timeline[2]).toBe(false);
  });

  it("не подавляет эскиз", () => {
    expect(() => setEntrySuppressed(document(), "t-s1", true)).toThrow("Эскиз нельзя подавить");
  });
});

describe("маркер отката", () => {
  it("откатывает записи после маркера и возвращает их обратно", () => {
    const rolled = rollTimelineTo(document(), 2).document;
    expect(rolled.timeline.map((item) => item.rolled_back === true)).toEqual([false, false, true, true, true, true]);
    expect(rollbackIndex(rolled.timeline)).toBe(2);

    const back = rollTimelineTo(rolled, 99).document;
    expect(back.timeline.some((item) => "rolled_back" in item)).toBe(false);
  });

  it("удаляет всё после маркера вместе с телами и эскизами", () => {
    const rolled = rollTimelineTo(document(), 3).document;
    const { document: next } = deleteRolledBack(rolled, (item) => item.label);

    expect(next.timeline.map((item) => item.id)).toEqual(["t-s1", "t-box", "t-fillet"]);
    expect(Object.keys(next.components).sort()).toEqual(["b1", "b2", "s1"]);
    expect(() => deleteRolledBack(next, (item) => item.label)).toThrow("После маркера отката нет операций");
  });

  it("вставляет новую операцию в точку маркера и переводит на неё откаченные", () => {
    const rolled = rollTimelineTo(document(), 3).document;
    const known = rolled.timeline.map((item) => item.id);
    const appended: ModelDocument = {
      components: { ...rolled.components, b5: body({ target_body_id: "b2" }) },
      timeline: [...rolled.timeline, entry("t-chamfer", "chamfer", { body_id: "b5", params: { target_body_id: "b2" } })],
    };

    const placed = placeAtRollbackMarker(known, appended);

    expect(placed?.document.timeline.map((item) => item.id)).toEqual(["t-s1", "t-box", "t-fillet", "t-chamfer", "t-s2", "t-cut", "t-up"]);
    expect(rollbackIndex(placed!.document.timeline)).toBe(4);
    expect(placed?.document.timeline.find((item) => item.id === "t-cut")?.params?.target_body_id).toBe("b5");
    expect(placed?.document.components.s2).toMatchObject({ ref_body_id: "b5" });
    expect(placed?.document.components.b3).toMatchObject({ source: { target_body_id: "b5" } });
    expect(placed?.seeds).toEqual({ roots: ["t-cut", "t-up"], bodies: ["b5"] });
    expect(placed?.restoreSeeds).toEqual({ roots: ["t-chamfer"], bodies: ["b2", "b5"] });
  });

  it("без маркера и без новых записей ничего не переставляет", () => {
    const original = document();
    expect(placeAtRollbackMarker(original.timeline.map((item) => item.id).slice(0, 5), original)).toBeNull();
    const rolled = rollTimelineTo(original, 3).document;
    expect(placeAtRollbackMarker(rolled.timeline.map((item) => item.id), rolled)).toBeNull();
  });
});
