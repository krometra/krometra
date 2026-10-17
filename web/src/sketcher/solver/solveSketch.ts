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
import { collectPins, restorePins } from "./fixConstraint";
import { applyCollinear, applyMidpoint, applyPointOnCurve, incidenceResidual } from "./incidenceConstraints";
import { createMidpointCarry } from "./midpointCarry";
import { CONVERGENCE_THRESHOLD, buildPointMap, pinOrigin, shareCoincidentPoints, writePointsBack, type PointMap } from "./pointMap";
import type { SketchConstraint, SketchEntity, SolverOutput } from "./types";

export type { ConstraintRef, ConstraintType, SketchConstraint, SketchEntity, SketchPoint, SolverOutput } from "./types";

const MAX_ITERATIONS = 500;

export function solveSketch(entities: SketchEntity[], constraints: SketchConstraint[]): SolverOutput {
  if (!constraints || constraints.length === 0) {
    return { entities, converged: true, residual: 0 };
  }

  const workEntities: SketchEntity[] = JSON.parse(JSON.stringify(entities));
  const points = buildPointMap(workEntities);
  shareCoincidentPoints(points, constraints, workEntities);
  const pins = collectPins(constraints, workEntities, points);
  const run = createMidpointCarry(workEntities, points);

  let converged = false;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let maxDisplacement = 0;
    for (const constraint of constraints) {
      maxDisplacement = Math.max(maxDisplacement, run(constraint, () => applyConstraint(constraint, workEntities, points)));
      pinOrigin(points);
      restorePins(pins);
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
    case "coincident": return applyCoincident(constraint, entities, points);
    case "parallel": return applyParallel(constraint, points);
    case "perpendicular": return applyPerpendicular(constraint, points);
    case "equal": return applyEqual(constraint, entities, points);
    case "distance": return applyDistance(constraint, entities, points);
    case "horizontal_distance": return applyAxisDistance(constraint, entities, points, "x");
    case "vertical_distance": return applyAxisDistance(constraint, entities, points, "y");
    case "length": return applyLength(constraint, points);
    case "line_distance": return applyLineDistance(constraint, points);
    case "point_line_distance": return applyPointLineDistance(constraint, entities, points);
    case "radius": return applyRadius(constraint, entities, points);
    case "diameter": return applyDiameter(constraint, entities, points);
    case "angle": return applyAngle(constraint, points);
    case "collinear": return applyCollinear(constraint, points);
    case "midpoint": return applyMidpoint(constraint, entities, points);
    case "point_on_curve": return applyPointOnCurve(constraint, entities, points);
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
      : Math.max(dimensionResidual(constraint, entities, points), incidenceResidual(constraint, entities, points));
    maxErr = Math.max(maxErr, error);
  }
  return maxErr;
}
