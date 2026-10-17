import { computed, watch, type Ref } from "vue";
import type { SketchConstraint, SketchEntity, SketchPoint } from "@/types/api";
import { useSketchConstraintFocus } from "@/composables/shared/useSketchConstraintFocus";
import { constraintEntityIds, constraintGlyphs, findConstraintGlyphAt } from "@/sketcher/constraintGlyphs";

interface GlyphSketch {
  constraints: Ref<SketchConstraint[]>;
  entities: Ref<SketchEntity[]>;
  selectedEntityIds: Ref<string[]>;
  clearSelection: () => void;
  removeConstraint: (id: string) => void;
}

export function useConstraintGlyphs(deps: {
  sketch: GlyphSketch;
  zoom: () => number;
  screenToWorld: (sx: number, sy: number) => SketchPoint;
}) {
  const { sketch } = deps;
  const focus = useSketchConstraintFocus();

  function hitAt(screenX: number, screenY: number): string | null {
    const unit = 1 / deps.zoom();
    const glyphs = constraintGlyphs(sketch.constraints.value, sketch.entities.value, unit);
    return findConstraintGlyphAt(glyphs, deps.screenToWorld(screenX, screenY), unit);
  }

  function hover(screenX: number, screenY: number): boolean {
    const id = hitAt(screenX, screenY);
    focus.hover(id);
    return id !== null;
  }

  function click(screenX: number, screenY: number): boolean {
    const id = hitAt(screenX, screenY);
    focus.select(id);
    return id !== null;
  }

  function deleteSelected(): boolean {
    const id = focus.selectedId.value;
    if (id === null) return false;
    focus.select(null);
    sketch.removeConstraint(id);
    return true;
  }

  const selected = computed(() => sketch.constraints.value.find((c) => c.id === focus.selectedId.value) ?? null);

  const highlightedIds = computed(() => {
    const focused = new Set([focus.hoveredId.value, focus.selectedId.value]);
    return sketch.constraints.value.filter((c) => focused.has(c.id)).flatMap(constraintEntityIds);
  });

  watch(sketch.constraints, (list) => focus.forget(new Set(list.map((c) => c.id))));
  watch(focus.selectedId, (id) => {
    if (id !== null) sketch.clearSelection();
  });
  watch(sketch.selectedEntityIds, (ids) => {
    if (ids.length > 0) focus.select(null);
  });

  return {
    hoveredId: focus.hoveredId,
    selectedId: focus.selectedId,
    selected,
    highlightedIds,
    hover,
    click,
    deleteSelected,
    clear: focus.clear,
  };
}

export type ConstraintGlyphsApi = ReturnType<typeof useConstraintGlyphs>;
