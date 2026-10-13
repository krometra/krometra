import { computed, ref, type Ref } from "vue";
import type { SketchEntity, SketchPoint } from "@/types/api";
import { lineRefOf, type LineRef } from "@/sketcher/geometry";
import { snapAt, type SnapCandidate } from "@/sketcher/snapCandidates";
import { niceGridSpacing } from "@/sketcher/gridSpacing";

const SNAP_PX = 10;

/**
 * Привязка курсора к точкам эскиза, пересечениям и вспомогательным прямым.
 */
export function useSketchSnapping(deps: {
  entities: Ref<SketchEntity[]>;
  zoom: () => number;
  screenToWorld: (sx: number, sy: number) => SketchPoint;
}) {
  const { entities, zoom, screenToWorld } = deps;

  const snapEnabled = ref(true);
  const snapPoint = ref<SketchPoint | null>(null);
  // Тип привязки под курсором: без него две привязки в одной точке
  // неразличимы, и пользователь не знает, куда встанет точка.
  const snapHint = ref<SnapCandidate | null>(null);

  const constructionLines = computed<LineRef[]>(() =>
    entities.value
      .map((e) => lineRefOf(e, { construction: true }))
      .filter((l): l is LineRef => l !== null)
  );

  function snapWorld(world: SketchPoint, anchor?: SketchPoint | null): SketchPoint {
    if (!snapEnabled.value) {
      clearSnap();
      return world;
    }

    const currentZoom = zoom();
    const candidate = snapAt(entities.value, world, SNAP_PX / currentZoom, niceGridSpacing(currentZoom), anchor);
    snapHint.value = candidate;
    snapPoint.value = candidate ? { ...candidate.point } : null;
    return candidate ? { ...candidate.point } : world;
  }

  function snappedScreenToWorld(sx: number, sy: number, anchor?: SketchPoint | null): SketchPoint {
    return snapWorld(screenToWorld(sx, sy), anchor);
  }

  function clearSnap() {
    snapPoint.value = null;
    snapHint.value = null;
  }

  return {
    snapEnabled,
    snapPoint,
    snapHint,
    constructionLines,
    snapWorld,
    snappedScreenToWorld,
    clearSnap,
  };
}

export type SketchSnappingApi = ReturnType<typeof useSketchSnapping>;
