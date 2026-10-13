import { computed, ref, type Ref } from "vue";
import type { SketchEntity, SketchInfiniteLine, SketchPoint } from "@/types/api";
import type { SketchTool as SketchToolName } from "@/composables/shared/useSketch";
import { isPointNearEntity, lineRefOf, type LineRef } from "@/sketcher/geometry";

export type AuxTool = "aux-parallel" | "aux-perpendicular" | "aux-vertical" | "aux-horizontal";

export const AUX_TOOLS: AuxTool[] = [
  "aux-parallel",
  "aux-perpendicular",
  "aux-vertical",
  "aux-horizontal",
];

const PICK_PX = 10;

/**
 * Вспомогательные прямые: выбор базовой линии, отступ и размещение.
 */
export function useAuxLines(deps: {
  tool: Ref<SketchToolName>;
  entities: Ref<SketchEntity[]>;
  zoom: () => number;
  canvasRect: () => DOMRect | undefined;
  nextEntityId: () => string;
  addEntities: (created: SketchEntity[]) => void;
  emitChanged: () => void;
}) {
  const { tool, entities, zoom, canvasRect, nextEntityId, addEntities, emitChanged } = deps;

  const isAuxTool = computed(() => AUX_TOOLS.includes(tool.value as AuxTool));

  const auxPhase = ref<"pick-base" | "place" | null>(null);
  const auxBaseId = ref<string | null>(null);
  const auxDistance = ref(0);
  const auxDistanceInput = ref<{ visible: boolean; x: number; y: number; value: string } | null>(null);
  const auxMouse = ref<SketchPoint | null>(null);

  function baseLineOf(entityId: string): LineRef | null {
    const e = entities.value.find((x) => x.id === entityId);
    if (!e) return null;
    return lineRefOf(e, { construction: false }) ?? lineRefOf(e, { construction: true });
  }

  function reset() {
    auxPhase.value = AUX_TOOLS.includes(tool.value as AuxTool)
      ? tool.value === "aux-vertical" || tool.value === "aux-horizontal"
        ? "place"
        : "pick-base"
      : null;
    auxBaseId.value = null;
    auxDistance.value = 0;
    auxDistanceInput.value = null;
    auxMouse.value = null;
  }

  function previewEntity(): SketchInfiniteLine | null {
    const m = auxMouse.value;
    if (!m || auxPhase.value !== "place") return null;

    if (tool.value === "aux-vertical") {
      return { id: "aux-preview", type: "infline", point: m, angle: Math.PI / 2 };
    }
    if (tool.value === "aux-horizontal") {
      return { id: "aux-preview", type: "infline", point: m, angle: 0 };
    }

    const base = auxBaseId.value ? baseLineOf(auxBaseId.value) : null;
    if (!base) return null;
    const baseAngle = Math.atan2(base.dir.y, base.dir.x);

    if (tool.value === "aux-perpendicular") {
      return { id: "aux-preview", type: "infline", point: m, angle: baseAngle + Math.PI / 2 };
    }

    // aux-parallel: place at auxDistance on the side where the mouse is
    const side =
      Math.sign(base.dir.x * (m.y - base.point.y) - base.dir.y * (m.x - base.point.x)) || 1;
    const nx = -base.dir.y * side;
    const ny = base.dir.x * side;
    return {
      id: "aux-preview",
      type: "infline",
      point: {
        x: base.point.x + nx * auxDistance.value,
        y: base.point.y + ny * auxDistance.value,
      },
      angle: baseAngle,
    };
  }

  function findBaseLineAt(world: SketchPoint): SketchEntity | null {
    const threshold = PICK_PX / zoom();
    for (let i = entities.value.length - 1; i >= 0; i--) {
      const e = entities.value[i];
      if (e.type !== "line" && e.type !== "infline") continue;
      if (isPointNearEntity(world, e, threshold)) return e;
    }
    return null;
  }

  function handleClick(world: SketchPoint) {
    if (auxPhase.value === "pick-base") {
      const base = findBaseLineAt(world);
      if (!base) return;
      auxBaseId.value = base.id;

      if (tool.value === "aux-parallel") {
        const rect = canvasRect();
        auxDistanceInput.value = {
          visible: true,
          x: (rect?.left ?? 0) + (rect?.width ?? 200) / 2 - 60,
          y: (rect?.top ?? 0) + 100,
          value: "",
        };
      } else {
        auxPhase.value = "place";
      }
      return;
    }

    if (auxPhase.value === "place") {
      const entity = previewEntity();
      if (!entity) return;
      addEntities([{ ...entity, id: nextEntityId(), point: { ...entity.point } }]);
      emitChanged();
      reset();
    }
  }

  function confirmDistance() {
    const val = parseFloat(auxDistanceInput.value?.value ?? "");
    if (isNaN(val)) {
      reset();
      return;
    }
    auxDistance.value = Math.abs(val);
    auxDistanceInput.value = null;
    auxPhase.value = "place";
  }

  function cancelDistance() {
    reset();
  }

  return {
    isAuxTool,
    auxPhase,
    auxDistance,
    auxDistanceInput,
    auxMouse,
    previewEntity,
    handleClick,
    confirmDistance,
    cancelDistance,
    reset,
  };
}

export type AuxLinesApi = ReturnType<typeof useAuxLines>;
