import { describe, expect, it } from "vitest";
import { resolveEditorMode, type EditorModeFlags } from "./mode";

const idle: EditorModeFlags = {
  sketch: false,
  planePick: false,
  sweepPanel: null,
  sweep: false,
  edgeFeature: null,
  thread: false,
  shell: false,
  mirror: false,
  hole: false,
  pattern: false,
  boolean: false,
  measure: false,
  pressPull: false,
};

describe("resolveEditorMode", () => {
  it("без активных инструментов редактор в режиме модели", () => {
    expect(resolveEditorMode(idle)).toBe("model");
  });

  it("называет каждый режим своим именем", () => {
    expect(resolveEditorMode({ ...idle, sketch: true })).toBe("sketch");
    expect(resolveEditorMode({ ...idle, planePick: true })).toBe("plane_pick");
    expect(resolveEditorMode({ ...idle, sweepPanel: "extrude" })).toBe("extrude");
    expect(resolveEditorMode({ ...idle, sweepPanel: "revolve" })).toBe("revolve");
    expect(resolveEditorMode({ ...idle, edgeFeature: "fillet" })).toBe("fillet");
    expect(resolveEditorMode({ ...idle, edgeFeature: "chamfer" })).toBe("chamfer");
    expect(resolveEditorMode({ ...idle, thread: true })).toBe("thread");
    expect(resolveEditorMode({ ...idle, shell: true })).toBe("shell");
    expect(resolveEditorMode({ ...idle, mirror: true })).toBe("mirror");
    expect(resolveEditorMode({ ...idle, hole: true })).toBe("hole");
    expect(resolveEditorMode({ ...idle, pattern: true })).toBe("pattern");
    expect(resolveEditorMode({ ...idle, boolean: true })).toBe("boolean");
    expect(resolveEditorMode({ ...idle, sweep: true })).toBe("sweep");
    expect(resolveEditorMode({ ...idle, measure: true })).toBe("measure");
    expect(resolveEditorMode({ ...idle, pressPull: true })).toBe("press_pull");
  });

  it("эскиз перекрывает панель операции так же, как правая панель редактора", () => {
    expect(resolveEditorMode({ ...idle, sketch: true, sweepPanel: "extrude", boolean: true })).toBe("sketch");
    expect(resolveEditorMode({ ...idle, sweepPanel: "revolve", edgeFeature: "fillet", thread: true })).toBe("revolve");
    expect(resolveEditorMode({ ...idle, edgeFeature: "chamfer", thread: true, boolean: true })).toBe("chamfer");
    expect(resolveEditorMode({ ...idle, hole: true, boolean: true })).toBe("hole");
  });
});
