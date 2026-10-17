import { isFixedReference } from "../sketchOrigin";
import { LINE_MIDPOINT } from "../sketchPoints";
import { getEntity, getPoint, midpoint, type PointMap } from "./pointMap";
import type { SketchConstraint, SketchEntity, SketchPoint } from "./types";

interface PinnedPoint {
  point: SketchPoint;
  x: number;
  y: number;
}

interface PinnedRadius {
  entity: SketchEntity;
  radius: number;
}

interface MidpointLink {
  start: SketchPoint;
  end: SketchPoint;
  mid: SketchPoint;
}

interface Guard {
  links: MidpointLink[];
  pins: PinnedPoint[];
  radii: PinnedRadius[];
}

const MAX_SUB_INDEX = 3;

function pinsOf(entityId: string, entities: SketchEntity[], points: PointMap): Pick<Guard, "pins" | "radii"> {
  const pins: PinnedPoint[] = [];
  for (let subIndex = 0; subIndex <= MAX_SUB_INDEX; subIndex++) {
    const point = getPoint(points, { entity_id: entityId, sub_index: subIndex });
    if (point) pins.push({ point, x: point.x, y: point.y });
  }
  const entity = getEntity(entities, entityId);
  const radii = entity?.radius === undefined ? [] : [{ entity, radius: entity.radius }];
  return { pins, radii };
}

function linkOf(entity: SketchEntity | undefined, points: PointMap): MidpointLink | null {
  if (entity?.type !== "line") return null;
  const ref = (subIndex: number) => getPoint(points, { entity_id: entity.id, sub_index: subIndex });
  const [start, end, mid] = [ref(0), ref(1), ref(LINE_MIDPOINT)];
  return start && end && mid ? { start, end, mid } : null;
}

function guardOf(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): Guard {
  const guard: Guard = { links: [], pins: [], radii: [] };
  const seen = new Set<string>();
  for (const anchor of constraint.anchors) {
    if (seen.has(anchor.entity_id)) continue;
    seen.add(anchor.entity_id);
    if (isFixedReference(anchor.entity_id)) {
      const { pins, radii } = pinsOf(anchor.entity_id, entities, points);
      guard.pins.push(...pins);
      guard.radii.push(...radii);
      continue;
    }
    const link = constraint.anchors.some((a) => a.entity_id === anchor.entity_id && a.sub_index === LINE_MIDPOINT)
      ? linkOf(getEntity(entities, anchor.entity_id), points)
      : null;
    if (link) guard.links.push(link);
  }
  return guard;
}

function refreshMidpoint(link: MidpointLink): SketchPoint {
  Object.assign(link.mid, midpoint(link.start, link.end));
  return { ...link.mid };
}

function carryMidpoint(link: MidpointLink, before: SketchPoint) {
  const dx = link.mid.x - before.x;
  const dy = link.mid.y - before.y;
  link.start.x += dx;
  link.start.y += dy;
  link.end.x += dx;
  link.end.y += dy;
  Object.assign(link.mid, midpoint(link.start, link.end));
}

function restore(guard: Guard) {
  for (const pin of guard.pins) {
    pin.point.x = pin.x;
    pin.point.y = pin.y;
  }
  for (const pin of guard.radii) pin.entity.radius = pin.radius;
}

export function touchesReference(constraint: SketchConstraint): boolean {
  return constraint.anchors.some((a) => isFixedReference(a.entity_id) || a.sub_index === LINE_MIDPOINT);
}

export type ConstraintRunner = (constraint: SketchConstraint, apply: () => number) => number;

export function createReferenceGuard(entities: SketchEntity[], points: PointMap): ConstraintRunner {
  const guards = new Map<SketchConstraint, Guard | null>();
  return (constraint, apply) => {
    if (!guards.has(constraint)) guards.set(constraint, touchesReference(constraint) ? guardOf(constraint, entities, points) : null);
    const guard = guards.get(constraint);
    if (!guard) return apply();
    const before = guard.links.map(refreshMidpoint);
    const displacement = apply();
    guard.links.forEach((link, i) => carryMidpoint(link, before[i]));
    restore(guard);
    return displacement;
  };
}
