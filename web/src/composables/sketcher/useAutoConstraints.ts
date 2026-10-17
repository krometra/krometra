import { computed, ref, shallowRef, type Ref } from "vue";
import { useEventListener } from "@vueuse/core";
import type { SketchConstraint, SketchEntity, SketchPoint } from "@/types/api";
import {
  AUTO_ANGLE_TOLERANCE,
  endReached,
  glyphsOf,
  materializeConstraints,
  ownAnchorsFor,
  planLineEnd,
  planPoint,
  type AutoPlan,
} from "@/sketcher/autoConstraints";
import type { SnapCandidate } from "@/sketcher/snapCandidates";
import { CONSTRAINT_TYPE_NAMES } from "@/lib/control/sketchConstraints";

const MIN_INFER_PX = 8;
const END_MATCH_PX = 0.5;

interface StrokeStart {
  point: SketchPoint;
  snap: SnapCandidate | null;
  suppressed: boolean;
}

export function useAutoConstraints(deps: {
  entities: Ref<SketchEntity[]>;
  pixelsToWorld: (px: number) => number;
  supported?: ReadonlySet<string>;
}) {
  const supported = deps.supported ?? new Set<string>(CONSTRAINT_TYPE_NAMES);
  const suppressed = ref(false);
  const start = shallowRef<StrokeStart | null>(null);
  const plan = shallowRef<AutoPlan | null>(null);

  useEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Shift") suppressed.value = true;
  });
  useEventListener("keyup", (e: KeyboardEvent) => {
    if (e.key === "Shift") suppressed.value = false;
  });
  useEventListener("blur", () => {
    suppressed.value = false;
  });

  function setSuppressed(value: boolean) {
    suppressed.value = value;
  }

  function begin(point: SketchPoint, snap: SnapCandidate | null) {
    start.value = { point, snap, suppressed: suppressed.value };
    plan.value = null;
  }

  function refineEnd(tool: string, point: SketchPoint, snap: SnapCandidate | null): SketchPoint {
    const from = start.value;
    if (!from || suppressed.value) {
      plan.value = null;
      return point;
    }
    if (tool === "line") {
      plan.value = planLineEnd(
        { start: from.point, startSnap: from.snap, end: point, endSnap: snap, entities: deps.entities.value },
        { supported, angleTolerance: AUTO_ANGLE_TOLERANCE, minLength: deps.pixelsToWorld(MIN_INFER_PX) },
      );
      return plan.value.end;
    }
    plan.value = tool === "rectangle" ? { end: point, constraints: planPoint("end", snap, supported) } : null;
    return point;
  }

  const hint = computed(() => {
    const current = plan.value;
    if (!current || current.constraints.length === 0) return null;
    return { at: current.end, symbols: glyphsOf(current.constraints) };
  });

  function constraintsFor(tool: string, produced: SketchEntity[], makeId: () => string): SketchConstraint[] {
    const resolve = ownAnchorsFor(tool, produced);
    const from = start.value;
    const ending = plan.value;
    reset();
    if (!resolve) return [];
    const endKept = ending && !suppressed.value && endReached(produced, resolve, ending.end, deps.pixelsToWorld(END_MATCH_PX));
    const planned = [
      ...(from && !from.suppressed ? planPoint("start", from.snap, supported) : []),
      ...(endKept ? ending.constraints : []),
    ];
    return materializeConstraints(planned, resolve, makeId);
  }

  function reset() {
    start.value = null;
    plan.value = null;
  }

  return { suppressed, hint, setSuppressed, begin, refineEnd, constraintsFor, reset };
}

export type AutoConstraintsApi = ReturnType<typeof useAutoConstraints>;
