import { describe, expect, it } from "vitest";
import { rebaseDocument, removedBodyIds, sameJson, type DocumentState } from "./documentRebase";

const body = (extra: Record<string, unknown> = {}) => ({ type: "body", source: { kind: "browser_extrude" }, visible: true, ...extra });
const entry = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "extrude", label: id, ...extra });

const before: DocumentState = {
  components: { a: body(), s1: { plane: "XY", entities: [] } },
  timeline: [entry("t-s1", { kind: "sketch" }), entry("t-a")],
};
const after: DocumentState = {
  components: { a: body({ visible: false }), b: body(), s1: { plane: "XY", entities: [] } },
  timeline: [...before.timeline, entry("t-b")],
};

describe("sameJson", () => {
  it("не зависит от порядка ключей", () => {
    expect(sameJson({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
  });
});

describe("rebaseDocument", () => {
  it("откатывает операцию, если после неё ничего не менялось", () => {
    const result = rebaseDocument(after, after, before);
    expect(result).toEqual({ ok: true, state: before });
  });

  it("сохраняет чужие правки, сделанные после операции", () => {
    const sketch2 = { plane: "XZ", entities: [] };
    const current: DocumentState = {
      components: { ...after.components, s2: sketch2 },
      timeline: [...after.timeline, entry("t-s2", { kind: "sketch" })],
    };
    const result = rebaseDocument(current, after, before);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.components).toEqual({ ...before.components, s2: sketch2 });
    expect(result.state.timeline.map((item) => item.id)).toEqual(["t-s1", "t-a", "t-s2"]);
  });

  it("повтор возвращает те же тела и записи после отката", () => {
    const undone = rebaseDocument(after, after, before);
    if (!undone.ok) throw new Error("откат не прошёл");
    expect(rebaseDocument(undone.state, before, after)).toEqual({ ok: true, state: after });
  });

  it("отказывает, если затронутое операцией изменено после неё", () => {
    const current: DocumentState = {
      components: { ...after.components, b: body({ bbox: { min: [0, 0, 0], max: [1, 1, 1] } }) },
      timeline: after.timeline,
    };
    expect(rebaseDocument(current, after, before)).toEqual({ ok: false, conflicts: ["b"] });
  });

  it("видимость тела не считается конфликтом", () => {
    const current: DocumentState = { components: { ...after.components, b: body({ visible: false }) }, timeline: after.timeline };
    expect(rebaseDocument(current, after, before).ok).toBe(true);
  });

  it("возвращает записи, заменённые операцией, на прежние места", () => {
    const merged: DocumentState = {
      components: before.components,
      timeline: [entry("t-s1", { kind: "sketch" }), entry("t-merged")],
    };
    const result = rebaseDocument(merged, merged, before);
    expect(result.ok && result.state.timeline.map((item) => item.id)).toEqual(["t-s1", "t-a"]);
  });
});

describe("removedBodyIds", () => {
  it("перечисляет только исчезнувшие тела", () => {
    expect(removedBodyIds(after, before)).toEqual(["b"]);
    expect(removedBodyIds(before, after)).toEqual([]);
  });
});
