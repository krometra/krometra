import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { isEmptyChange, timelineChange } from "./timelineChange";

const entry = (id: string, params: Record<string, unknown> = {}): TimelineEntry => ({ id, kind: "extrude", label: id, status: "ok", timestamp: "", params });

describe("timelineChange", () => {
  it("различает добавленные, удалённые и изменённые записи", () => {
    const change = timelineChange([entry("a"), entry("b", { distance: 1 }), entry("c")], [entry("a"), entry("b", { distance: 2 }), entry("d")]);
    expect(change.added.map((item) => item.id)).toEqual(["d"]);
    expect(change.removed.map((item) => item.id)).toEqual(["c"]);
    expect(change.changed.map((item) => item.id)).toEqual(["b"]);
  });

  it("без изменений отчёт пуст", () => {
    expect(isEmptyChange(timelineChange([entry("a")], [entry("a")]))).toBe(true);
  });
});
