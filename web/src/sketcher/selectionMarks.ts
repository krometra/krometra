import type { SketchPoint } from "@/types/api";
import type { DimensionTarget } from "./dimensionPlan";
import { sketchAxisOf, type SketchAxis } from "./sketchOrigin";

export interface SelectionMarks {
  points: SketchPoint[];
  axes: SketchAxis[];
  hoveredAxis: SketchAxis | null;
}

export const NO_MARKS: SelectionMarks = Object.freeze({ points: [], axes: [], hoveredAxis: null }) as SelectionMarks;

function axisOfTarget(target: DimensionTarget | null): SketchAxis | null {
  return target?.kind === "line" ? sketchAxisOf(target.ref.entity_id) : null;
}

export function marksOfTargets(targets: (DimensionTarget | null)[], hovered: DimensionTarget | null): SelectionMarks {
  const points = targets.flatMap((t) => (t?.kind === "point" ? [t.at] : []));
  const axes = targets.flatMap((t) => axisOfTarget(t) ?? []);
  return { points, axes, hoveredAxis: axisOfTarget(hovered) };
}
