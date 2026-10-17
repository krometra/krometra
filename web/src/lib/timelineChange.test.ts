import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { changedComponentIds, isEmptyChange, timelineChange } from "./timelineChange";

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

  it("перечисляет изменённые, добавленные и удалённые компоненты документа", () => {
    const before = { p1: { plane_offset: 10 }, s1: { entities: [] }, gone: { type: "body" } };
    const after = { p1: { plane_offset: 15 }, s1: { entities: [] }, added: { type: "work_plane" } };
    expect(changedComponentIds(before, after).sort()).toEqual(["added", "gone", "p1"]);
    expect(changedComponentIds(before, before)).toEqual([]);
  });
});
