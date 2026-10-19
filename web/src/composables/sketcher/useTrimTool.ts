import { computed, shallowRef, type Ref } from "vue";
import type { SketchPoint } from "@/types/api";
import type { SketchTool as SketchToolName } from "@/composables/shared/useSketch";
import { applyTrim, findTrimTarget, type TrimTarget } from "@/sketcher/sketchTrim";
import type { SketchEntitiesApi } from "./useSketchEntities";

type EditableSketch = Pick<SketchEntitiesApi, "entities" | "constraints" | "nextEntityId" | "nextConstraintId" | "applyEdit">;

const PICK_PX = 10;

export function useTrimTool(deps: { tool: Ref<SketchToolName>; sketch: EditableSketch; zoom: () => number }) {
  const { sketch } = deps;
  const active = computed(() => deps.tool.value === "trim");
  const target = shallowRef<TrimTarget | null>(null);

  const removal = computed(() => target.value?.piece ?? null);
  const hint = "Кликните участок кривой: он удалится до ближайших пересечений";

  function targetAt(world: SketchPoint): TrimTarget | null {
    return findTrimTarget(world, sketch.entities.value, PICK_PX / deps.zoom());
  }

  function move(world: SketchPoint) {
    target.value = targetAt(world);
  }

  function click(world: SketchPoint) {
    const found = targetAt(world);
    if (!found) return;
    sketch.applyEdit(applyTrim(found, sketch.entities.value, sketch.constraints.value, {
      entityId: sketch.nextEntityId,
      constraintId: sketch.nextConstraintId,
    }));
    target.value = targetAt(world);
  }

  function reset() {
    target.value = null;
  }

  return { active, removal, hint, move, click, reset };
}

export type TrimToolApi = ReturnType<typeof useTrimTool>;
