import { describe, expect, it } from "vitest";
import { resolveEditorMode, type EditorModeFlags } from "./mode";

const idle: EditorModeFlags = {
  sketch: false,
  planePick: false,
  sweepPanel: null,
  edgeFeature: null,
  thread: false,
  hole: false,
  boolean: false,
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
    expect(resolveEditorMode({ ...idle, hole: true })).toBe("hole");
    expect(resolveEditorMode({ ...idle, boolean: true })).toBe("boolean");
  });

  it("эскиз перекрывает панель операции так же, как правая панель редактора", () => {
    expect(resolveEditorMode({ ...idle, sketch: true, sweepPanel: "extrude", boolean: true })).toBe("sketch");
    expect(resolveEditorMode({ ...idle, sweepPanel: "revolve", edgeFeature: "fillet", thread: true })).toBe("revolve");
    expect(resolveEditorMode({ ...idle, edgeFeature: "chamfer", thread: true, boolean: true })).toBe("chamfer");
    expect(resolveEditorMode({ ...idle, hole: true, boolean: true })).toBe("hole");
  });
});
