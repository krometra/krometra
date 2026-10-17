import {
  applyAngle,
  applyAxisDistance,
  applyDiameter,
  applyDistance,
  applyLength,
  applyLineDistance,
  applyPointLineDistance,
  applyRadius,
  dimensionResidual,
} from "./dimensionConstraints";
import {
  alignedPair,
  applyCoincident,
  applyEqual,
  applyHorizontal,
  applyParallel,
  applyPerpendicular,
  applyVertical,
} from "./geometricConstraints";
import { CONVERGENCE_THRESHOLD, buildPointMap, writePointsBack, type PointMap } from "./pointMap";
import { createReferenceGuard, touchesReference } from "./settle";
import type { SketchConstraint, SketchEntity, SolverOutput } from "./types";

export type { ConstraintRef, ConstraintType, SketchConstraint, SketchEntity, SketchPoint, SolverOutput } from "./types";

const MAX_ITERATIONS = 50;
const REFERENCE_ITERATIONS = 200;

export function solveSketch(entities: SketchEntity[], constraints: SketchConstraint[]): SolverOutput {
  if (!constraints || constraints.length === 0) {
    return { entities, converged: true, residual: 0 };
  }

  const workEntities: SketchEntity[] = JSON.parse(JSON.stringify(entities));
  const points = buildPointMap(workEntities);
  const run = createReferenceGuard(workEntities, points);

  let converged = false;
  const iterations = constraints.some(touchesReference) ? REFERENCE_ITERATIONS : MAX_ITERATIONS;
  for (let iter = 0; iter < iterations; iter++) {
    let maxDisplacement = 0;
    for (const constraint of constraints) {
      maxDisplacement = Math.max(maxDisplacement, run(constraint, () => applyConstraint(constraint, workEntities, points)));
    }
    if (maxDisplacement < CONVERGENCE_THRESHOLD) {
      converged = true;
      break;
    }
  }

  writePointsBack(workEntities, points);
  const residual = computeResidual(constraints, workEntities);
  return { entities: workEntities, converged, residual };
}

function applyConstraint(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): number {
  switch (constraint.type) {
    case "horizontal": return applyHorizontal(constraint, points);
    case "vertical": return applyVertical(constraint, points);
    case "coincident": return applyCoincident(constraint, points);
    case "parallel": return applyParallel(constraint, points);
    case "perpendicular": return applyPerpendicular(constraint, points);
    case "equal": return applyEqual(constraint, entities, points);
    case "distance": return applyDistance(constraint, points);
    case "horizontal_distance": return applyAxisDistance(constraint, points, "x");
    case "vertical_distance": return applyAxisDistance(constraint, points, "y");
    case "length": return applyLength(constraint, points);
    case "line_distance": return applyLineDistance(constraint, points);
    case "point_line_distance": return applyPointLineDistance(constraint, points);
    case "radius": return applyRadius(constraint, entities, points);
    case "diameter": return applyDiameter(constraint, entities, points);
    case "angle": return applyAngle(constraint, points);
    default: return 0;
  }
}

function alignmentResidual(constraint: SketchConstraint, points: PointMap): number {
  const segment = alignedPair(constraint, points);
  if (!segment) return 0;
  return constraint.type === "horizontal"
    ? Math.abs(segment.start.y - segment.end.y)
    : Math.abs(segment.start.x - segment.end.x);
}

function computeResidual(constraints: SketchConstraint[], entities: SketchEntity[]): number {
  const points = buildPointMap(entities);
  let maxErr = 0;
  for (const constraint of constraints) {
    const error = constraint.type === "horizontal" || constraint.type === "vertical"
      ? alignmentResidual(constraint, points)
      : dimensionResidual(constraint, entities, points);
    maxErr = Math.max(maxErr, error);
  }
  return maxErr;
}
