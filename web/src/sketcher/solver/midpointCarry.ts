import { LINE_MIDPOINT } from "../sketchPoints";
import { getEntity, getPoint, midpoint, type PointMap } from "./pointMap";
import type { SketchConstraint, SketchEntity, SketchPoint } from "./types";

interface MidpointLink {
  start: SketchPoint;
  end: SketchPoint;
  mid: SketchPoint;
}

function linkOf(entity: SketchEntity | undefined, points: PointMap): MidpointLink | null {
  if (entity?.type !== "line") return null;
  const ref = (subIndex: number) => getPoint(points, { entity_id: entity.id, sub_index: subIndex });
  const [start, end, mid] = [ref(0), ref(1), ref(LINE_MIDPOINT)];
  return start && end && mid ? { start, end, mid } : null;
}

function linksOf(constraint: SketchConstraint, entities: SketchEntity[], points: PointMap): MidpointLink[] {
  const ids = new Set(constraint.anchors.filter((a) => a.sub_index === LINE_MIDPOINT).map((a) => a.entity_id));
  return [...ids].flatMap((id) => linkOf(getEntity(entities, id), points) ?? []);
}

function refresh(link: MidpointLink): SketchPoint {
  Object.assign(link.mid, midpoint(link.start, link.end));
  return { ...link.mid };
}

function carry(link: MidpointLink, before: SketchPoint) {
  const dx = link.mid.x - before.x;
  const dy = link.mid.y - before.y;
  link.start.x += dx;
  link.start.y += dy;
  link.end.x += dx;
  link.end.y += dy;
  Object.assign(link.mid, midpoint(link.start, link.end));
}

export type ConstraintRunner = (constraint: SketchConstraint, apply: () => number) => number;

export function createMidpointCarry(entities: SketchEntity[], points: PointMap): ConstraintRunner {
  const links = new Map<SketchConstraint, MidpointLink[]>();
  return (constraint, apply) => {
    let own = links.get(constraint);
    if (!own) {
      own = linksOf(constraint, entities, points);
      links.set(constraint, own);
    }
    if (own.length === 0) return apply();
    const before = own.map(refresh);
    const displacement = apply();
    own.forEach((link, i) => carry(link, before[i]));
    return displacement;
  };
}
