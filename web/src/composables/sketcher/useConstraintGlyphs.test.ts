import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { SketchConstraint, SketchEntity } from "@/types/api";
import { useSketchConstraintFocus } from "@/composables/shared/useSketchConstraintFocus";
import { useConstraintGlyphs } from "./useConstraintGlyphs";

const line = (id: string, y: number): SketchEntity => ({ id, type: "line", start: { x: 0, y }, end: { x: 40, y } });

function setup() {
  const constraints = ref<SketchConstraint[]>([
    { id: "eq", type: "equal", anchors: [{ entity_id: "a", sub_index: 0 }, { entity_id: "b", sub_index: 0 }], value: null },
    { id: "h", type: "horizontal", anchors: [{ entity_id: "c", sub_index: 0 }], value: null },
  ]);
  const deps = {
    constraints,
    entities: ref<SketchEntity[]>([line("a", 0), line("b", 40), line("c", 80)]),
    selectedEntityIds: ref<string[]>([]),
    clearSelection: vi.fn(),
    removeConstraint: vi.fn((id: string) => {
      constraints.value = constraints.value.filter((c) => c.id !== id);
    }),
  };
  const glyphs = useConstraintGlyphs({ sketch: deps, zoom: () => 1, screenToWorld: (sx, sy) => ({ x: sx, y: sy }) });
  return { glyphs, deps };
}

describe("useConstraintGlyphs", () => {
  beforeEach(() => useSketchConstraintFocus().clear());

  it("ховер по значку равенства подсвечивает оба отрезка пары", () => {
    const { glyphs } = setup();
    expect(glyphs.hover(20, 14)).toBe(true);
    expect(glyphs.hoveredId.value).toBe("eq");
    expect(glyphs.highlightedIds.value).toEqual(["a", "b"]);
    expect(glyphs.hover(20, 0)).toBe(false);
    expect(glyphs.highlightedIds.value).toEqual([]);
  });

  it("клик выбирает ограничение и снимает выделение объектов", async () => {
    const { glyphs, deps } = setup();
    expect(glyphs.click(20, 94)).toBe(true);
    expect(glyphs.selected.value?.id).toBe("h");
    await nextTick();
    expect(deps.clearSelection).toHaveBeenCalled();
    expect(glyphs.highlightedIds.value).toEqual(["c"]);
  });

  it("клик мимо значков снимает выбор ограничения", () => {
    const { glyphs } = setup();
    glyphs.click(20, 94);
    expect(glyphs.click(200, 200)).toBe(false);
    expect(glyphs.selectedId.value).toBeNull();
  });

  it("Delete удаляет выбранное ограничение и только его", () => {
    const { glyphs, deps } = setup();
    expect(glyphs.deleteSelected()).toBe(false);
    glyphs.click(20, 14);
    expect(glyphs.deleteSelected()).toBe(true);
    expect(deps.removeConstraint).toHaveBeenCalledWith("eq");
    expect(deps.constraints.value.map((c) => c.id)).toEqual(["h"]);
    expect(glyphs.selectedId.value).toBeNull();
  });

  it("выбор объекта снимает выбор ограничения", async () => {
    const { glyphs, deps } = setup();
    glyphs.click(20, 94);
    deps.selectedEntityIds.value = ["a"];
    await nextTick();
    expect(glyphs.selectedId.value).toBeNull();
  });

  it("ограничение, исчезнувшее после Ctrl+Z, перестаёт быть выбранным", async () => {
    const { glyphs, deps } = setup();
    glyphs.click(20, 94);
    deps.constraints.value = deps.constraints.value.filter((c) => c.id !== "h");
    await nextTick();
    expect(glyphs.selected.value).toBeNull();
    expect(glyphs.selectedId.value).toBeNull();
  });
});
