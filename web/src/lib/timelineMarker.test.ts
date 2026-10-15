import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { entryStateHint, markerIndexAt, steppedMarker, timelineSlots } from "./timelineMarker";

const entry = (id: string, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id, kind: "extrude", label: id, status: "ok", timestamp: "", ...extra,
});

describe("timelineMarker", () => {
  it("маркер встаёт в зазор между узлами под курсором", () => {
    const centers = [20, 80, 140];
    expect(markerIndexAt(centers, 0)).toBe(0);
    expect(markerIndexAt(centers, 50)).toBe(1);
    expect(markerIndexAt(centers, 139)).toBe(2);
    expect(markerIndexAt(centers, 400)).toBe(3);
  });

  it("стрелки сдвигают маркер на шаг в пределах истории", () => {
    expect(steppedMarker(2, -1, 3)).toBe(1);
    expect(steppedMarker(0, -1, 3)).toBe(0);
    expect(steppedMarker(3, 1, 3)).toBe(3);
  });

  it("раскладывает узлы и маркер в порядке шкалы", () => {
    const slots = timelineSlots([entry("a"), entry("b")], 1);
    expect(slots.map((slot) => (slot.kind === "marker" ? "|" : slot.entry.id))).toEqual(["a", "|", "b"]);
    expect(timelineSlots([entry("a")], 5).at(-1)).toEqual({ kind: "marker" });
  });

  it("объясняет состояние записи", () => {
    expect(entryStateHint(entry("a", { status: "error", error_message: "Грань исчезла." }))).toBe("Ошибка: Грань исчезла.");
    expect(entryStateHint(entry("a", { suppressed: true }))).toContain("Подавлена");
    expect(entryStateHint(entry("a", { rolled_back: true }))).toContain("маркера отката");
    expect(entryStateHint(entry("a"))).toBeNull();
  });
});
