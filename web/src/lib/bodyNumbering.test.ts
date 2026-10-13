import { describe, it, expect } from "vitest";
import { bodyNumbering } from "./bodyNumbering";
import type { TimelineEntry } from "@/types/api";

const entry = (e: Partial<TimelineEntry>): TimelineEntry =>
  ({
    id: e.id ?? "t",
    timestamp: "",
    kind: e.kind ?? "extrude",
    label: "",
    status: "ok",
    ...e,
  }) as TimelineEntry;

describe("bodyNumbering", () => {
  it("нумерует тела в порядке появления в timeline", () => {
    const tl = [entry({ id: "e1", body_id: "a" }), entry({ id: "e2", body_id: "b" })];
    const n = bodyNumbering(tl, ["a", "b"]);
    expect(n.get("a")).toBe(1);
    expect(n.get("b")).toBe(2);
  });

  it("номер поглощённого тела не переезжает на соседа (репро перепутанных подписей)", () => {
    const tl = [
      entry({ id: "e1", body_id: "b1" }),
      entry({ id: "e2", body_id: "b2" }),
      entry({ id: "e3", kind: "boolean", target_body_id: "b1", tool_body_id: "b2", result_body_id: "b3" }),
    ];
    // b1 поглощено вырезом и убрано из components — в документе остался только результат.
    const n = bodyNumbering(tl, ["b3"]);
    expect(n.get("b1")).toBe(1);
    expect(n.get("b2")).toBe(2);
    expect(n.get("b3")).toBe(3);
  });

  it("номер тела не меняется от последующих операций", () => {
    const before = bodyNumbering([entry({ id: "e1", body_id: "a" })], ["a"]);
    const after = bodyNumbering(
      [entry({ id: "e1", body_id: "a" }), entry({ id: "e2", body_id: "b" })],
      ["a", "b"],
    );
    expect(after.get("a")).toBe(before.get("a"));
  });

  it("тело без записи в timeline получает номер в конце", () => {
    const n = bodyNumbering([entry({ id: "e1", body_id: "a" })], ["a", "orphan"]);
    expect(n.get("a")).toBe(1);
    expect(n.get("orphan")).toBe(2);
  });

  it("внутри записи цель нумеруется раньше инструмента", () => {
    const tl = [entry({ id: "e1", kind: "boolean", target_body_id: "t", tool_body_id: "tool" })];
    const n = bodyNumbering(tl, []);
    expect(n.get("t")).toBe(1);
    expect(n.get("tool")).toBe(2);
  });

  it("повторные ссылки не плодят номеров", () => {
    const tl = [
      entry({ id: "e1", body_id: "a" }),
      entry({ id: "e2", kind: "fillet", body_id: "a", result_body_id: "a" }),
    ];
    const n = bodyNumbering(tl, ["a"]);
    expect(n.size).toBe(1);
    expect(n.get("a")).toBe(1);
  });

  it("пустой документ даёт пустую нумерацию", () => {
    expect(bodyNumbering([], []).size).toBe(0);
  });
});
