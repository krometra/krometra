import { ccwSweep } from "../arcGeometry";
import { SKETCH_ORIGIN, SKETCH_ORIGIN_ID } from "../sketchOrigin";
import type { ConstraintRef, SketchConstraint, SketchEntity, SketchPoint } from "./types";

export type PointMap = Map<string, SketchPoint>;

export const LEARNING_RATE = 0.5;
export const CONVERGENCE_THRESHOLD = 0.001;

const ORIGIN_KEY = `${SKETCH_ORIGIN_ID}:0`;

function key(entityId: string, subIndex: number): string {
  return `${entityId}:${subIndex}`;
}

function setPoint(map: PointMap, entityId: string, subIndex: number, pt: SketchPoint) {
  const k = key(entityId, subIndex);
  if (!map.has(k)) map.set(k, { x: pt.x, y: pt.y });
}

function onCircle(center: SketchPoint, radius: number, angle: number): SketchPoint {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

export function buildPointMap(entities: SketchEntity[]): PointMap {
  const map: PointMap = new Map();
  map.set(ORIGIN_KEY, { ...SKETCH_ORIGIN });
  for (const entity of entities) {
    switch (entity.type) {
      case "line":
        setPoint(map, entity.id, 0, entity.start!);
        setPoint(map, entity.id, 1, entity.end!);
        break;
      case "circle":
        setPoint(map, entity.id, 0, entity.center!);
        setPoint(map, entity.id, 1, onCircle(entity.center!, entity.radius!, 0));
        break;
      case "arc":
        setPoint(map, entity.id, 0, entity.center!);
        setPoint(map, entity.id, 1, onCircle(entity.center!, entity.radius!, entity.startAngle!));
        setPoint(map, entity.id, 2, onCircle(entity.center!, entity.radius!, entity.endAngle!));
        break;
      case "rectangle":
        setPoint(map, entity.id, 0, entity.corner1!);
        setPoint(map, entity.id, 1, entity.corner2!);
        setPoint(map, entity.id, 2, { x: entity.corner2!.x, y: entity.corner1!.y });
        setPoint(map, entity.id, 3, { x: entity.corner1!.x, y: entity.corner2!.y });
        break;
    }
  }
  return map;
}

function isPointToPoint(constraint: SketchConstraint): boolean {
  return constraint.type === "coincident" && constraint.anchors.length >= 2;
}

function fixedKeys(constraints: SketchConstraint[], entities: SketchEntity[]): Set<string> {
  const keys = new Set<string>();
  for (const constraint of constraints.filter((c) => c.type === "fix")) {
    for (const ref of constraint.anchors) {
      if (ref.sub_index >= 0) keys.add(key(ref.entity_id, ref.sub_index));
      else if (getEntity(entities, ref.entity_id)) for (let i = 0; i < 4; i++) keys.add(key(ref.entity_id, i));
    }
  }
  return keys;
}

function coincidentGroups(points: PointMap, constraints: SketchConstraint[]): string[][] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let root = k;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(k, root);
    return root;
  };
  for (const constraint of constraints.filter(isPointToPoint)) {
    const keys = constraint.anchors.map((ref) => key(ref.entity_id, ref.sub_index)).filter((k) => points.has(k));
    for (const k of keys.slice(1)) {
      const [ra, rb] = [find(keys[0]), find(k)];
      if (ra !== rb) parent.set(rb, ra);
    }
  }
  const groups = new Map<string, string[]>();
  for (const k of parent.keys()) groups.set(find(k), [...(groups.get(find(k)) ?? []), k]);
  return [...groups.values()];
}

function carryRoundPoints(points: PointMap, entities: SketchEntity[], centerKey: string, shared: Set<string>, dx: number, dy: number) {
  const [entityId, sub] = [centerKey.slice(0, centerKey.lastIndexOf(":")), centerKey.slice(centerKey.lastIndexOf(":") + 1)];
  const entity = sub === "0" ? getEntity(entities, entityId) : undefined;
  if (!entity) return;
  const rest = roundPoints(points, entity).slice(1);
  rest.forEach((p, i) => {
    if (!shared.has(key(entityId, i + 1))) shiftPoints([p], dx, dy);
  });
}

export function shareCoincidentPoints(points: PointMap, constraints: SketchConstraint[], entities: SketchEntity[]) {
  const groups = coincidentGroups(points, constraints);
  const shared = new Set(groups.flat());
  const fixed = fixedKeys(constraints, entities);
  for (const members of groups) {
    const anchor = members.find((k) => k === ORIGIN_KEY) ?? members.find((k) => fixed.has(k));
    const target = anchor ? { ...points.get(anchor)! } : centroid(members.map((k) => points.get(k)!));
    for (const k of members) {
      const original = points.get(k)!;
      carryRoundPoints(points, entities, k, shared, target.x - original.x, target.y - original.y);
    }
    const point = anchor ? points.get(anchor)! : target;
    Object.assign(point, target);
    for (const k of members) points.set(k, point);
  }
}

function centroid(list: SketchPoint[]): SketchPoint {
  const sum = list.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / list.length, y: sum.y / list.length };
}

export function pinOrigin(points: PointMap) {
  const origin = points.get(ORIGIN_KEY);
  if (!origin) return;
  origin.x = SKETCH_ORIGIN.x;
  origin.y = SKETCH_ORIGIN.y;
}

export function getPoint(points: PointMap, ref: ConstraintRef): SketchPoint | null {
  return points.get(key(ref.entity_id, ref.sub_index)) ?? null;
}

export function getEntity(entities: SketchEntity[], id: string): SketchEntity | undefined {
  return entities.find((e) => e.id === id);
}

export interface Segment {
  start: SketchPoint;
  end: SketchPoint;
}

export function anchorSegment(points: PointMap, ref: ConstraintRef): Segment | null {
  const start = getPoint(points, { entity_id: ref.entity_id, sub_index: 0 });
  const end = getPoint(points, { entity_id: ref.entity_id, sub_index: 1 });
  return start && end ? { start, end } : null;
}

export function anchorRay(points: PointMap, ref: ConstraintRef): Segment | null {
  const segment = anchorSegment(points, ref);
  if (!segment) return null;
  return ref.sub_index === 1 ? { start: segment.end, end: segment.start } : segment;
}

export function roundPoints(points: PointMap, entity: SketchEntity): SketchPoint[] {
  const count = entity.type === "arc" ? 3 : entity.type === "circle" ? 2 : 0;
  return Array.from({ length: count }, (_, i) => getPoint(points, { entity_id: entity.id, sub_index: i }))
    .filter((p): p is SketchPoint => p !== null);
}

export function movingPoints(points: PointMap, entities: SketchEntity[], ref: ConstraintRef): SketchPoint[] {
  const point = getPoint(points, ref);
  if (!point) return [];
  const entity = ref.sub_index === 0 ? getEntity(entities, ref.entity_id) : undefined;
  const round = entity ? roundPoints(points, entity) : [];
  return round.length > 0 ? round : [point];
}

export function shiftPoints(moving: SketchPoint[], dx: number, dy: number) {
  for (const p of moving) {
    p.x += dx;
    p.y += dy;
  }
}

export function constraintSegments(points: PointMap, constraint: SketchConstraint, count: number): Segment[] | null {
  if (constraint.anchors.length < count) return null;
  const segments = constraint.anchors.slice(0, count).map((ref) => anchorSegment(points, ref));
  return segments.every((s): s is Segment => s !== null) ? segments : null;
}

export function updateArcPoints(entity: SketchEntity, points: PointMap) {
  const center = getPoint(points, { entity_id: entity.id, sub_index: 0 }) ?? entity.center ?? { x: 0, y: 0 };
  const radius = entity.radius ?? 0;
  if (entity.type === "arc") {
    const start = getPoint(points, { entity_id: entity.id, sub_index: 1 });
    if (start) Object.assign(start, onCircle(center, radius, entity.startAngle ?? 0));
    const end = getPoint(points, { entity_id: entity.id, sub_index: 2 });
    if (end) Object.assign(end, onCircle(center, radius, entity.endAngle ?? Math.PI));
  }
  if (entity.type === "circle") {
    const rim = getPoint(points, { entity_id: entity.id, sub_index: 1 });
    if (rim) Object.assign(rim, { x: center.x + radius, y: center.y });
  }
}

function copyPoint(points: PointMap, entityId: string, subIndex: number, target: SketchPoint | undefined) {
  const source = getPoint(points, { entity_id: entityId, sub_index: subIndex });
  if (source && target) {
    target.x = source.x;
    target.y = source.y;
  }
}

function writeCircle(entity: SketchEntity, points: PointMap) {
  copyPoint(points, entity.id, 0, entity.center);
  const rim = getPoint(points, { entity_id: entity.id, sub_index: 1 });
  if (rim && entity.center) entity.radius = Math.hypot(rim.x - entity.center.x, rim.y - entity.center.y);
}

function writeArc(entity: SketchEntity, points: PointMap) {
  copyPoint(points, entity.id, 0, entity.center);
  const center = entity.center;
  if (!center) return;
  const start = getPoint(points, { entity_id: entity.id, sub_index: 1 });
  const end = getPoint(points, { entity_id: entity.id, sub_index: 2 });
  if (start) entity.startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  if (end) entity.endAngle = entity.startAngle! + ccwSweep(entity.startAngle!, Math.atan2(end.y - center.y, end.x - center.x));
  if (start) entity.radius = Math.hypot(start.x - center.x, start.y - center.y);
}

export function writePointsBack(entities: SketchEntity[], points: PointMap) {
  for (const entity of entities) {
    switch (entity.type) {
      case "line":
        copyPoint(points, entity.id, 0, entity.start);
        copyPoint(points, entity.id, 1, entity.end);
        break;
      case "circle":
        writeCircle(entity, points);
        break;
      case "arc":
        writeArc(entity, points);
        break;
      case "rectangle":
        copyPoint(points, entity.id, 0, entity.corner1);
        copyPoint(points, entity.id, 1, entity.corner2);
        break;
    }
  }
}
