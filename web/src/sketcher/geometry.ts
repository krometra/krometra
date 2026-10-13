// Pure 2D geometry helpers for the sketcher — no Vue, no DOM, unit-testable.

import type { SketchEntity, SketchPoint } from "@/types/api";

export interface LineRef {
  point: SketchPoint;
  dir: SketchPoint;
}

/** Геометрия построения: не входит в профиль и не выбирается мышью. */
export function isConstruction(e: SketchEntity): boolean {
  return e.type === "infline" || Boolean((e as { construction?: boolean }).construction);
}

export function lineRefOf(e: SketchEntity, options: { construction: boolean }): LineRef | null {
  if (e.type === "infline") {
    return { point: e.point, dir: { x: Math.cos(e.angle), y: Math.sin(e.angle) } };
  }
  if (e.type !== "line") return null;
  if (Boolean(e.construction) !== options.construction) return null;
  const dx = e.end.x - e.start.x;
  const dy = e.end.y - e.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  return { point: e.start, dir: { x: dx / len, y: dy / len } };
}

export function intersectLines(a: LineRef, b: LineRef): SketchPoint | null {
  const cross = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
  if (Math.abs(cross) < 1e-9) return null;
  const dx = b.point.x - a.point.x;
  const dy = b.point.y - a.point.y;
  const t = (dx * b.dir.y - dy * b.dir.x) / cross;
  return { x: a.point.x + a.dir.x * t, y: a.point.y + a.dir.y * t };
}

export function projectOnLine(p: SketchPoint, line: LineRef): SketchPoint {
  const t = (p.x - line.point.x) * line.dir.x + (p.y - line.point.y) * line.dir.y;
  return { x: line.point.x + line.dir.x * t, y: line.point.y + line.dir.y * t };
}

export function distanceToLineSegment(p: SketchPoint, a: SketchPoint, b: SketchPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function isPointNearEntity(
  point: SketchPoint,
  entity: SketchEntity,
  threshold: number
): boolean {
  switch (entity.type) {
    case "infline": {
      const dx = Math.cos(entity.angle);
      const dy = Math.sin(entity.angle);
      const px = point.x - entity.point.x;
      const py = point.y - entity.point.y;
      return Math.abs(px * dy - py * dx) < threshold;
    }
    case "line":
      return distanceToLineSegment(point, entity.start, entity.end) < threshold;
    case "rectangle": {
      const x1 = Math.min(entity.corner1.x, entity.corner2.x);
      const y1 = Math.min(entity.corner1.y, entity.corner2.y);
      const x2 = Math.max(entity.corner1.x, entity.corner2.x);
      const y2 = Math.max(entity.corner1.y, entity.corner2.y);
      const dx = Math.max(x1 - point.x, 0, point.x - x2);
      const dy = Math.max(y1 - point.y, 0, point.y - y2);
      return Math.hypot(dx, dy) < threshold;
    }
    case "circle":
      return (
        Math.abs(Math.hypot(point.x - entity.center.x, point.y - entity.center.y) - entity.radius) <
        threshold
      );
    case "arc": {
      const d = Math.hypot(point.x - entity.center.x, point.y - entity.center.y);
      const angle = Math.atan2(point.y - entity.center.y, point.x - entity.center.x);
      let sa = entity.startAngle;
      let ea = entity.endAngle;
      if (sa > ea) [sa, ea] = [ea, sa];
      return Math.abs(d - entity.radius) < threshold && angle >= sa - 0.1 && angle <= ea + 0.1;
    }
  }
  return false;
}

/** Points a cursor can snap to: endpoints, midpoints, centers, quadrants. */
export function entitySnapTargets(entities: SketchEntity[]): SketchPoint[] {
  const points: SketchPoint[] = [];
  for (const e of entities) {
    switch (e.type) {
      case "line":
        points.push(e.start, e.end, {
          x: (e.start.x + e.end.x) / 2,
          y: (e.start.y + e.end.y) / 2,
        });
        break;
      case "rectangle":
        points.push(
          e.corner1,
          e.corner2,
          { x: e.corner2.x, y: e.corner1.y },
          { x: e.corner1.x, y: e.corner2.y }
        );
        break;
      case "circle":
        points.push(
          e.center,
          { x: e.center.x + e.radius, y: e.center.y },
          { x: e.center.x - e.radius, y: e.center.y },
          { x: e.center.x, y: e.center.y + e.radius },
          { x: e.center.x, y: e.center.y - e.radius }
        );
        break;
      case "arc":
        points.push(
          e.center,
          {
            x: e.center.x + e.radius * Math.cos(e.startAngle),
            y: e.center.y + e.radius * Math.sin(e.startAngle),
          },
          {
            x: e.center.x + e.radius * Math.cos(e.endAngle),
            y: e.center.y + e.radius * Math.sin(e.endAngle),
          }
        );
        break;
    }
  }
  return points;
}

export function pairwiseIntersections(lines: LineRef[]): SketchPoint[] {
  const points: SketchPoint[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const pt = intersectLines(lines[i], lines[j]);
      if (pt) points.push(pt);
    }
  }
  return points;
}
