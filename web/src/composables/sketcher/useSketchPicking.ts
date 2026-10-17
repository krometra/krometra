import { computed, shallowRef, type Ref } from "vue";
import type { SketchEntity, SketchPoint } from "@/types/api";
import { targetOfSelection } from "@/sketcher/dimensionTargets";
import { pickDrawableEntity, pickSketchEntity, pickSketchItem, type SketchPick } from "@/sketcher/sketchPick";
import type { EdgeDragApi } from "./useEdgeDrag";
import type { SketchSelectionApi } from "./useSketchSelection";

const PICK_PX = 10;

const entityPick = (entity: SketchEntity | null): SketchPick | null =>
  entity ? { item: { kind: "entity", entityId: entity.id }, at: null, label: null } : null;

export function useSketchPicking(deps: {
  entities: Ref<SketchEntity[]>;
  zoom: () => number;
  selection: SketchSelectionApi;
  edgeDrag: EdgeDragApi;
}) {
  const hovered = shallowRef<SketchPick | null>(null);

  const hoveredEntityId = computed(() => (hovered.value?.item.kind === "entity" ? hovered.value.item.entityId : null));
  const hoveredTarget = computed(() => (hovered.value ? targetOfSelection(hovered.value.item, deps.entities.value) : null));
  const hoveredPoint = computed(() => {
    const pick = hovered.value;
    return pick?.at ? { at: pick.at, label: pick.label } : null;
  });

  const threshold = () => PICK_PX / deps.zoom();

  function hoverItemAt(world: SketchPoint) {
    hovered.value = pickSketchItem(world, deps.entities.value, threshold());
  }

  function hoverEntityAt(world: SketchPoint) {
    hovered.value = entityPick(pickSketchEntity(world, deps.entities.value, threshold()));
  }

  function clearHover() {
    hovered.value = null;
  }

  function apply(pick: SketchPick | null, world: SketchPoint): boolean {
    if (!pick) {
      deps.selection.clear();
      return false;
    }
    const entity = pick.item.kind === "entity" ? pick.item.entityId : null;
    const line = deps.entities.value.find((e) => e.id === entity);
    if (line?.type === "line" && !line.construction) deps.edgeDrag.start(line, world);
    else deps.selection.toggle(pick.item);
    return true;
  }

  function selectAt(world: SketchPoint): boolean {
    return apply(pickSketchItem(world, deps.entities.value, threshold()), world);
  }

  function selectDrawableAt(world: SketchPoint): boolean {
    return apply(entityPick(pickDrawableEntity(world, deps.entities.value, threshold())), world);
  }

  return { hovered, hoveredEntityId, hoveredTarget, hoveredPoint, hoverItemAt, hoverEntityAt, clearHover, selectAt, selectDrawableAt };
}

export type SketchPickingApi = ReturnType<typeof useSketchPicking>;
