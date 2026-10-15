// Ядро решателя ограничений: итеративная релаксация для 2D эскизов.
// Чистая функция без Worker/DOM — используется воркером и юнит-тестами.

import { ccwSweep } from "../arcGeometry";
export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchEntity {
  id: string;
  type: "line" | "rectangle" | "circle" | "arc";
  start?: SketchPoint;
  end?: SketchPoint;
  center?: SketchPoint;
  radius?: number;
  corner1?: SketchPoint;
  corner2?: SketchPoint;
  startAngle?: number;
  endAngle?: number;
}

export type ConstraintType =
  | "horizontal" | "vertical" | "coincident"
  | "parallel" | "perpendicular" | "equal"
  | "distance" | "radius" | "angle";

export interface ConstraintRef {
  entity_id: string;
  sub_index: number;
}

export interface SketchConstraint {
  id: string;
  type: ConstraintType;
  anchors: ConstraintRef[];
  value: number | null;
}

export interface SolverOutput {
  entities: SketchEntity[];
  converged: boolean;
  residual: number;
}

// Point map: key = "entityId:subIndex" → { x, y }
type PointKey = string;
type PointMap = Map<PointKey, { x: number; y: number }>;

const MAX_ITERATIONS = 50;
const CONVERGENCE_THRESHOLD = 0.001;
const LEARNING_RATE = 0.5;

export function solveSketch(
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): SolverOutput {
  if (!constraints || constraints.length === 0) {
    return { entities, converged: true, residual: 0 };
  }

  const workEntities: SketchEntity[] = JSON.parse(JSON.stringify(entities));
  const points = buildPointMap(workEntities);

  let converged = false;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let maxDisplacement = 0;
    for (const constraint of constraints) {
      maxDisplacement = Math.max(
        maxDisplacement,
        applyConstraint(constraint, workEntities, points)
      );
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


function buildPointMap(entities: SketchEntity[]): PointMap {
  const map: PointMap = new Map();
  const entityMap = new Map<string, SketchEntity>();
  for (const e of entities) entityMap.set(e.id, e);

  for (const entity of entities) {
    switch (entity.type) {
      case "line":
        setPoint(map, entity.id, 0, entity.start!);
        setPoint(map, entity.id, 1, entity.end!);
        break;
      case "circle":
        setPoint(map, entity.id, 0, entity.center!);
        setPoint(map, entity.id, 1, radiusPoint(entity, 0)); // rightmost point
        break;
      case "arc":
        setPoint(map, entity.id, 0, entity.center!);
        setPoint(map, entity.id, 1, {
          x: entity.center!.x + entity.radius! * Math.cos(entity.startAngle!),
          y: entity.center!.y + entity.radius! * Math.sin(entity.startAngle!),
        });
        setPoint(map, entity.id, 2, {
          x: entity.center!.x + entity.radius! * Math.cos(entity.endAngle!),
          y: entity.center!.y + entity.radius! * Math.sin(entity.endAngle!),
        });
        break;
      case "rectangle":
        setPoint(map, entity.id, 0, entity.corner1!);
        setPoint(map, entity.id, 1, entity.corner2!);
        setPoint(map, entity.id, 2, { x: entity.corner2!.x, y: entity.corner1!.y }); // top-right
        setPoint(map, entity.id, 3, { x: entity.corner1!.x, y: entity.corner2!.y }); // bottom-left
        break;
    }
  }
  return map;
}

function setPoint(map: PointMap, entityId: string, subIndex: number, pt: SketchPoint) {
  const key = `${entityId}:${subIndex}`;
  if (!map.has(key)) {
    map.set(key, { x: pt.x, y: pt.y });
  }
}

function radiusPoint(entity: SketchEntity, angle: number): SketchPoint {
  return {
    x: entity.center!.x + entity.radius! * Math.cos(angle),
    y: entity.center!.y + entity.radius! * Math.sin(angle),
  };
}

function getPoint(pts: PointMap, ref: ConstraintRef): { x: number; y: number } | null {
  const key = `${ref.entity_id}:${ref.sub_index}`;
  return pts.get(key) ?? null;
}

function getEntity(entities: SketchEntity[], id: string): SketchEntity | undefined {
  return entities.find((e) => e.id === id);
}


function applyConstraint(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  switch (constraint.type) {
    case "horizontal": return applyHorizontal(constraint, entities, points);
    case "vertical": return applyVertical(constraint, entities, points);
    case "coincident": return applyCoincident(constraint, entities, points);
    case "parallel": return applyParallel(constraint, entities, points);
    case "perpendicular": return applyPerpendicular(constraint, entities, points);
    case "equal": return applyEqual(constraint, entities, points);
    case "distance": return applyDistance(constraint, entities, points);
    case "radius": return applyRadius(constraint, entities, points);
    case "angle": return applyAngle(constraint, entities, points);
    default: return 0;
  }
}

// --- Geometric constraints ---

function applyHorizontal(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  // horizontal(line): force start.y == end.y
  if (constraint.anchors.length < 1) return 0;
  const p0 = getPoint(points, constraint.anchors[0]); // start
  const p1 = getPoint(points, { ...constraint.anchors[0], sub_index: 1 }); // end (same entity)
  if (!p0 || !p1) return 0;

  const dy = Math.abs(p0.y - p1.y);
  const avgY = (p0.y + p1.y) / 2;
  p0.y = avgY;
  p1.y = avgY;
  return dy;
}

function applyVertical(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  // vertical(line): force start.x == end.x
  if (constraint.anchors.length < 1) return 0;
  const p0 = getPoint(points, constraint.anchors[0]);
  const p1 = getPoint(points, { ...constraint.anchors[0], sub_index: 1 });
  if (!p0 || !p1) return 0;

  const dx = Math.abs(p0.x - p1.x);
  const avgX = (p0.x + p1.x) / 2;
  p0.x = avgX;
  p1.x = avgX;
  return dx;
}

function applyCoincident(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  // coincident(point, point_or_line): align two points
  if (constraint.anchors.length < 2) return 0;
  const p0 = getPoint(points, constraint.anchors[0]);
  const p1 = getPoint(points, constraint.anchors[1]);
  if (!p0 || !p1) return 0;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Move both halfway
  p0.x += dx * 0.5 * LEARNING_RATE;
  p0.y += dy * 0.5 * LEARNING_RATE;
  p1.x -= dx * 0.5 * LEARNING_RATE;
  p1.y -= dy * 0.5 * LEARNING_RATE;
  return dist;
}

function applyParallel(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  // parallel(line1, line2): enforce same direction angle
  if (constraint.anchors.length < 2) return 0;
  const p0 = getPoint(points, constraint.anchors[0]);
  const p1 = getPoint(points, { ...constraint.anchors[0], sub_index: 1 });
  const p2 = getPoint(points, constraint.anchors[1]);
  const p3 = getPoint(points, { ...constraint.anchors[1], sub_index: 1 });
  if (!p0 || !p1 || !p2 || !p3) return 0;

  const angle1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);

  let angleDiff = angle2 - angle1;
  // mod π
  while (angleDiff > Math.PI / 2) angleDiff -= Math.PI;
  while (angleDiff < -Math.PI / 2) angleDiff += Math.PI;

  if (Math.abs(angleDiff) < CONVERGENCE_THRESHOLD) return 0;

  // Rotate each line halfway
  const len1 = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
  const len2 = Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2);
  if (len1 < 1 || len2 < 1) return 0;

  const half = angleDiff * 0.5 * LEARNING_RATE;
  const newAngle1 = angle1 + half;
  const newAngle2 = angle2 - half;

  // Rotate line 1 end around start
  const cx1 = p0.x, cy1 = p0.y;
  p1.x = cx1 + len1 * Math.cos(newAngle1);
  p1.y = cy1 + len1 * Math.sin(newAngle1);

  // Rotate line 2 end around start
  const cx2 = p2.x, cy2 = p2.y;
  p3.x = cx2 + len2 * Math.cos(newAngle2);
  p3.y = cy2 + len2 * Math.sin(newAngle2);

  return Math.abs(angleDiff);
}

function applyPerpendicular(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  // perpendicular(line1, line2): enforce 90° difference
  if (constraint.anchors.length < 2) return 0;
  const p0 = getPoint(points, constraint.anchors[0]);
  const p1 = getPoint(points, { ...constraint.anchors[0], sub_index: 1 });
  const p2 = getPoint(points, constraint.anchors[1]);
  const p3 = getPoint(points, { ...constraint.anchors[1], sub_index: 1 });
  if (!p0 || !p1 || !p2 || !p3) return 0;

  const angle1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);

  let angleDiff = angle2 - angle1 - Math.PI / 2;
  while (angleDiff > Math.PI / 2) angleDiff -= Math.PI;
  while (angleDiff < -Math.PI / 2) angleDiff += Math.PI;

  if (Math.abs(angleDiff) < CONVERGENCE_THRESHOLD) return 0;

  const len1 = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
  const len2 = Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2);
  if (len1 < 1 || len2 < 1) return 0;

  const half = angleDiff * 0.5 * LEARNING_RATE;
  const newAngle1 = angle1 + half;
  const newAngle2 = angle2 - half;

  p1.x = p0.x + len1 * Math.cos(newAngle1);
  p1.y = p0.y + len1 * Math.sin(newAngle1);
  p3.x = p2.x + len2 * Math.cos(newAngle2);
  p3.y = p2.y + len2 * Math.sin(newAngle2);

  return Math.abs(angleDiff);
}

function applyEqual(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  // equal(ent1, ent2): enforce same length/radius
  if (constraint.anchors.length < 2) return 0;
  const e1 = getEntity(entities, constraint.anchors[0].entity_id);
  const e2 = getEntity(entities, constraint.anchors[1].entity_id);
  if (!e1 || !e2) return 0;

  if (e1.type === "line" && e2.type === "line") {
    const p0 = getPoint(points, constraint.anchors[0]);
    const p1 = getPoint(points, { ...constraint.anchors[0], sub_index: 1 });
    const p2 = getPoint(points, constraint.anchors[1]);
    const p3 = getPoint(points, { ...constraint.anchors[1], sub_index: 1 });
    if (!p0 || !p1 || !p2 || !p3) return 0;

    const len1 = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
    const len2 = Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2);
    const avgLen = (len1 + len2) / 2;
    if (avgLen < 1) return 0;

    const err = Math.abs(len1 - len2);
    // Scale each line toward average
    const scale1 = 1 + (avgLen / len1 - 1) * LEARNING_RATE;
    const scale2 = 1 + (avgLen / len2 - 1) * LEARNING_RATE;

    const cx1 = p0.x, cy1 = p0.y;
    const cx2 = p2.x, cy2 = p2.y;
    p1.x = cx1 + (p1.x - cx1) * scale1;
    p1.y = cy1 + (p1.y - cy1) * scale1;
    p3.x = cx2 + (p3.x - cx2) * scale2;
    p3.y = cy2 + (p3.y - cy2) * scale2;
    return err;
  }

  if ((e1.type === "circle" || e1.type === "arc") && (e2.type === "circle" || e2.type === "arc")) {
    const r1 = e1.radius ?? 0;
    const r2 = e2.radius ?? 0;
    const avgR = (r1 + r2) / 2;
    if (avgR < 1) return 0;
    const err = Math.abs(r1 - r2);
    e1.radius = r1 + (avgR - r1) * LEARNING_RATE;
    e2.radius = r2 + (avgR - r2) * LEARNING_RATE;
    // Update dependent points
    updateArcPoints(e1, points, constraint.anchors[0]);
    updateArcPoints(e2, points, constraint.anchors[1]);
    return err;
  }

  return 0;
}

// --- Dimensional constraints ---

function applyDistance(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  // distance(point, point, value): enforce specific distance
  if (constraint.anchors.length < 2 || constraint.value === null) return 0;
  const p0 = getPoint(points, constraint.anchors[0]);
  const p1 = getPoint(points, constraint.anchors[1]);
  if (!p0 || !p1) return 0;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const currentDist = Math.sqrt(dx * dx + dy * dy);
  if (currentDist < 0.001) return 0;

  const targetDist = constraint.value!;
  const err = Math.abs(currentDist - targetDist);
  const correction = (targetDist - currentDist) * LEARNING_RATE;

  // Move along the line between them
  const nx = dx / currentDist;
  const ny = dy / currentDist;
  p0.x -= nx * correction * 0.5;
  p0.y -= ny * correction * 0.5;
  p1.x += nx * correction * 0.5;
  p1.y += ny * correction * 0.5;
  return err;
}

function applyRadius(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  // radius(circle/arc, value): enforce specific radius
  if (constraint.anchors.length < 1 || constraint.value === null) return 0;
  const entity = getEntity(entities, constraint.anchors[0].entity_id);
  if (!entity || (entity.type !== "circle" && entity.type !== "arc")) return 0;

  const currentR = entity.radius ?? 0;
  const targetR = constraint.value!;
  const err = Math.abs(currentR - targetR);
  entity.radius = currentR + (targetR - currentR) * LEARNING_RATE;

  // Update angle-dependent points for arcs
  updateArcPoints(entity, points, constraint.anchors[0]);
  return err;
}

function applyAngle(
  constraint: SketchConstraint,
  entities: SketchEntity[],
  points: PointMap
): number {
  // angle(line1, line2, value): enforce specific angle between lines
  if (constraint.anchors.length < 2 || constraint.value === null) return 0;
  const p0 = getPoint(points, constraint.anchors[0]);
  const p1 = getPoint(points, { ...constraint.anchors[0], sub_index: 1 });
  const p2 = getPoint(points, constraint.anchors[1]);
  const p3 = getPoint(points, { ...constraint.anchors[1], sub_index: 1 });
  if (!p0 || !p1 || !p2 || !p3) return 0;

  const angle1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);

  let currentAngle = angle2 - angle1;
  // Normalize to [-π, π]
  while (currentAngle > Math.PI) currentAngle -= 2 * Math.PI;
  while (currentAngle < -Math.PI) currentAngle += 2 * Math.PI;

  const targetAngle = (constraint.value! * Math.PI) / 180; // degrees to radians
  const angleErr = currentAngle - targetAngle;
  if (Math.abs(angleErr) < CONVERGENCE_THRESHOLD) return 0;

  const len1 = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
  const len2 = Math.sqrt((p3.x - p2.x) ** 2 + (p3.y - p2.y) ** 2);
  if (len1 < 1 || len2 < 1) return 0;

  // Rotate only line 2 to fix the angle
  const correction = -angleErr * LEARNING_RATE;
  const newAngle2 = angle2 + correction;
  p3.x = p2.x + len2 * Math.cos(newAngle2);
  p3.y = p2.y + len2 * Math.sin(newAngle2);

  return Math.abs(angleErr);
}

// --- Helpers ---

function updateArcPoints(entity: SketchEntity, points: PointMap, ref: ConstraintRef) {
  if (entity.type === "arc") {
    const sa = entity.startAngle ?? 0;
    const ea = entity.endAngle ?? Math.PI;
    const r = entity.radius ?? 0;
    const cx = entity.center?.x ?? 0;
    const cy = entity.center?.y ?? 0;

    const pStart = getPoint(points, { entity_id: ref.entity_id, sub_index: 1 });
    if (pStart) { pStart.x = cx + r * Math.cos(sa); pStart.y = cy + r * Math.sin(sa); }

    const pEnd = getPoint(points, { entity_id: ref.entity_id, sub_index: 2 });
    if (pEnd) { pEnd.x = cx + r * Math.cos(ea); pEnd.y = cy + r * Math.sin(ea); }
  }
  // For circle: update sub_index 1 (rightmost point)
  if (entity.type === "circle") {
    const r = entity.radius ?? 0;
    const cx = entity.center?.x ?? 0;
    const cy = entity.center?.y ?? 0;
    const pr = getPoint(points, { entity_id: ref.entity_id, sub_index: 1 });
    if (pr) { pr.x = cx + r; pr.y = cy; }
  }
}

function writePointsBack(entities: SketchEntity[], points: PointMap) {
  for (const entity of entities) {
    switch (entity.type) {
      case "line":
        if (entity.start) {
          const s = getPoint(points, { entity_id: entity.id, sub_index: 0 });
          if (s) { entity.start.x = s.x; entity.start.y = s.y; }
        }
        if (entity.end) {
          const e = getPoint(points, { entity_id: entity.id, sub_index: 1 });
          if (e) { entity.end.x = e.x; entity.end.y = e.y; }
        }
        break;
      case "circle": {
        if (entity.center) {
          const c = getPoint(points, { entity_id: entity.id, sub_index: 0 });
          if (c) { entity.center.x = c.x; entity.center.y = c.y; }
        }
        const rpt = getPoint(points, { entity_id: entity.id, sub_index: 1 });
        if (rpt && entity.center) {
          entity.radius = Math.sqrt((rpt.x - entity.center.x) ** 2 + (rpt.y - entity.center.y) ** 2);
        }
        break;
      }
      case "arc": {
        if (entity.center) {
          const c = getPoint(points, { entity_id: entity.id, sub_index: 0 });
          if (c) { entity.center.x = c.x; entity.center.y = c.y; }
        }
        const cp = entity.center;
        if (cp) {
          const psa = getPoint(points, { entity_id: entity.id, sub_index: 1 });
          const pea = getPoint(points, { entity_id: entity.id, sub_index: 2 });
          if (psa) entity.startAngle = Math.atan2(psa.y - cp.y, psa.x - cp.x);
          if (pea) entity.endAngle = entity.startAngle! + ccwSweep(entity.startAngle!, Math.atan2(pea.y - cp.y, pea.x - cp.x));
          if (psa && cp) {
            entity.radius = Math.sqrt((psa.x - cp.x) ** 2 + (psa.y - cp.y) ** 2);
          }
        }
        break;
      }
      case "rectangle":
        if (entity.corner1) {
          const c = getPoint(points, { entity_id: entity.id, sub_index: 0 });
          if (c) { entity.corner1.x = c.x; entity.corner1.y = c.y; }
        }
        if (entity.corner2) {
          const c = getPoint(points, { entity_id: entity.id, sub_index: 1 });
          if (c) { entity.corner2.x = c.x; entity.corner2.y = c.y; }
        }
        break;
    }
  }
}

function computeResidual(
  constraints: SketchConstraint[],
  entities: SketchEntity[]
): number {
  const points = buildPointMap(entities);
  let maxErr = 0;

  for (const c of constraints) {
    switch (c.type) {
      case "horizontal": {
        if (c.anchors.length < 1) break;
        const p0 = getPoint(points, c.anchors[0]);
        const p1 = getPoint(points, { ...c.anchors[0], sub_index: 1 });
        if (p0 && p1) maxErr = Math.max(maxErr, Math.abs(p0.y - p1.y));
        break;
      }
      case "vertical": {
        if (c.anchors.length < 1) break;
        const p0 = getPoint(points, c.anchors[0]);
        const p1 = getPoint(points, { ...c.anchors[0], sub_index: 1 });
        if (p0 && p1) maxErr = Math.max(maxErr, Math.abs(p0.x - p1.x));
        break;
      }
      case "distance": {
        if (c.anchors.length < 2 || c.value === null) break;
        const p0 = getPoint(points, c.anchors[0]);
        const p1 = getPoint(points, c.anchors[1]);
        if (p0 && p1) {
          const d = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
          maxErr = Math.max(maxErr, Math.abs(d - c.value));
        }
        break;
      }
      case "radius": {
        if (c.value === null) break;
        const e = getEntity(entities, c.anchors[0]?.entity_id ?? "");
        if (e && e.radius !== undefined) maxErr = Math.max(maxErr, Math.abs(e.radius - c.value));
        break;
      }
    }
  }
  return maxErr;
}
