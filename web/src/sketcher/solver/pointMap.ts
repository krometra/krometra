import { ccwSweep } from "../arcGeometry";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN, SKETCH_ORIGIN_ID } from "../sketchOrigin";
import { LINE_MIDPOINT, REFERENCE_SPAN, axisSegment } from "../sketchPoints";
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

export const midpoint = (a: SketchPoint, b: SketchPoint): SketchPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function inflineSegment(point: SketchPoint, angle: number): Segment {
  return { start: point, end: { x: point.x + Math.cos(angle) * REFERENCE_SPAN, y: point.y + Math.sin(angle) * REFERENCE_SPAN } };
}

function setSegment(map: PointMap, entityId: string, segment: Segment) {
  setPoint(map, entityId, 0, segment.start);
  setPoint(map, entityId, 1, segment.end);
}

export function buildPointMap(entities: SketchEntity[]): PointMap {
  const map: PointMap = new Map();
  map.set(ORIGIN_KEY, { ...SKETCH_ORIGIN });
  setSegment(map, SKETCH_AXIS_IDS.x, axisSegment("x"));
  setSegment(map, SKETCH_AXIS_IDS.y, axisSegment("y"));
  for (const entity of entities) {
    switch (entity.type) {
      case "line":
        setPoint(map, entity.id, 0, entity.start!);
        setPoint(map, entity.id, 1, entity.end!);
        setPoint(map, entity.id, LINE_MIDPOINT, midpoint(entity.start!, entity.end!));
        break;
      case "infline":
        setSegment(map, entity.id, inflineSegment(entity.point!, entity.angle!));
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

export function constraintSegments(points: PointMap, constraint: SketchConstraint, count: number): Segment[] | null {
  if (constraint.anchors.length < count) return null;
  const segments = constraint.anchors.slice(0, count).map((ref) => anchorSegment(points, ref));
  return segments.every((s): s is Segment => s !== null) ? segments : null;
}

export function updateArcPoints(entity: SketchEntity, points: PointMap) {
  const center = entity.center ?? { x: 0, y: 0 };
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
  const rim = getPoint(points, { entity_id: entity.id, sub_index: 1 });
  if (rim && entity.center) entity.radius = Math.hypot(rim.x - entity.center.x, rim.y - entity.center.y);
  copyPoint(points, entity.id, 0, entity.center);
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
      case "infline":
        writeInfline(entity, points);
        break;
    }
  }
}

function writeInfline(entity: SketchEntity, points: PointMap) {
  const segment = anchorSegment(points, { entity_id: entity.id, sub_index: 0 });
  if (!segment || !entity.point) return;
  copyPoint(points, entity.id, 0, entity.point);
  entity.angle = Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x);
}
