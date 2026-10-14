import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { bodyChain, bodyConsumers, deleteBody, deleteEntry, deleteSketch, HistoryEditError, type ModelDocument } from "./bodyHistory";

const describeEntry = (entry: TimelineEntry) => entry.label;

function entry(id: string, kind: TimelineEntry["kind"], extra: Partial<TimelineEntry> = {}): TimelineEntry {
  return { id, kind, label: id, status: "ok", timestamp: "", ...extra };
}

const body = (visible = true) => ({ type: "body", visible, source: { kind: "browser_extrude" } });
const sketch = (refBodyId?: string) => ({ plane: "XY", entities: [], ...(refBodyId ? { ref_body_id: refBodyId } : {}) });

function documentWithJoinChain(): ModelDocument {
  return {
    components: { s1: sketch(), s2: sketch("a"), s3: sketch(), a: body(false), b: body(), c: body() },
    timeline: [
      entry("t-s1", "sketch", { sketch_id: "s1" }),
      entry("t-a", "extrude", { sketch_id: "s1", body_id: "a" }),
      entry("t-s2", "sketch", { sketch_id: "s2" }),
      entry("t-b", "extrude", { sketch_id: "s2", body_id: "b", params: { operation: "join", target_body_id: "a" } }),
      entry("t-s3", "sketch", { sketch_id: "s3" }),
      entry("t-c", "extrude", { sketch_id: "s3", body_id: "c" }),
    ],
  };
}

describe("bodyConsumers", () => {
  it("находит операцию, поглотившую тело", () => {
    expect(bodyConsumers(documentWithJoinChain()).get("a")?.id).toBe("t-b");
    expect(bodyConsumers(documentWithJoinChain()).has("b")).toBe(false);
  });

  it("копирующее перемещение тело не поглощает", () => {
    const document: ModelDocument = {
      components: { a: body(), b: body() },
      timeline: [entry("t-m", "transform", { body_id: "b", params: { target_body_id: "a", copy: true } })],
    };
    expect(bodyConsumers(document).size).toBe(0);
  });
});

describe("deleteBody", () => {
  it("удаляет тело вместе с его цепочкой и эскизами", () => {
    const document = documentWithJoinChain();
    expect(bodyChain(document, "b").map((item) => item.id)).toEqual(["t-s1", "t-a", "t-s2", "t-b"]);
    const result = deleteBody(document, "b", describeEntry);
    expect(Object.keys(result.components).sort()).toEqual(["c", "s3"]);
    expect(result.timeline.map((item) => item.id)).toEqual(["t-s3", "t-c"]);
  });

  it("не удаляет поглощённое тело", () => {
    expect(() => deleteBody(documentWithJoinChain(), "a", describeEntry)).toThrow(HistoryEditError);
  });

  it("не удаляет тело, от которого зависит другая операция", () => {
    const document = documentWithJoinChain();
    document.timeline.push(entry("t-d", "extrude", { sketch_id: "s3", body_id: "d", params: { extent_type: "up_to_body", up_to_body_id: "b" } }));
    expect(() => deleteBody(document, "b", describeEntry)).toThrow(/t-d/);
  });
});

describe("deleteEntry", () => {
  it("удаляет последнюю операцию и показывает поглощённое ею тело", () => {
    const result = deleteEntry(documentWithJoinChain(), "t-b", describeEntry);
    expect(result.components.b).toBeUndefined();
    expect(result.components.a).toEqual(body(true));
    expect(result.timeline.map((item) => item.id)).not.toContain("t-b");
  });

  it("не удаляет операцию, на результат которой опираются", () => {
    expect(() => deleteEntry(documentWithJoinChain(), "t-a", describeEntry)).toThrow(/t-b/);
  });
});

describe("deleteSketch", () => {
  it("удаляет неиспользованный эскиз с записью истории", () => {
    const document = documentWithJoinChain();
    document.components.s4 = sketch();
    document.timeline.push(entry("t-s4", "sketch", { sketch_id: "s4" }));
    const result = deleteSketch(document, "s4", describeEntry);
    expect(result.components.s4).toBeUndefined();
    expect(result.timeline.map((item) => item.id)).not.toContain("t-s4");
  });

  it("не удаляет эскиз, по которому построена операция", () => {
    expect(() => deleteSketch(documentWithJoinChain(), "s3", describeEntry)).toThrow(/t-c/);
  });
});
