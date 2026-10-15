import type { SketchPoint } from "@/types/api";

const TWO_PI = Math.PI * 2;
const COLLINEAR_SINE = 1e-3;
const MIN_LENGTH = 1e-9;

export interface ArcShape {
  center: SketchPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export function ccwSweep(from: number, to: number): number {
  return (((to - from) % TWO_PI) + TWO_PI) % TWO_PI;
}

export function isAngleOnArc(angle: number, startAngle: number, endAngle: number, tolerance: number): boolean {
  return ccwSweep(startAngle - tolerance, angle) <= ccwSweep(startAngle, endAngle) + 2 * tolerance;
}

function angleAt(center: SketchPoint, point: SketchPoint): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

function isDegenerate(a: SketchPoint, b: SketchPoint, c: SketchPoint): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) < MIN_LENGTH
    || Math.hypot(c.x - a.x, c.y - a.y) < MIN_LENGTH
    || Math.hypot(c.x - b.x, c.y - b.y) < MIN_LENGTH;
}

export function areCollinear(a: SketchPoint, b: SketchPoint, c: SketchPoint): boolean {
  if (isDegenerate(a, b, c)) return false;
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const scale = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - a.x, c.y - a.y);
  return Math.abs(cross) / scale < COLLINEAR_SINE;
}

function circumcenter(a: SketchPoint, b: SketchPoint, c: SketchPoint): SketchPoint {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

export function threePointArc(start: SketchPoint, end: SketchPoint, via: SketchPoint): ArcShape | null {
  if (isDegenerate(start, end, via) || areCollinear(start, end, via)) return null;
  const center = circumcenter(start, end, via);
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  const from = angleAt(center, start);
  const to = angleAt(center, end);
  if (ccwSweep(from, angleAt(center, via)) < ccwSweep(from, to)) {
    return { center, radius, startAngle: from, endAngle: from + ccwSweep(from, to) };
  }
  return { center, radius, startAngle: to, endAngle: to + ccwSweep(to, from) };
}

export function arcEndpoints(arc: ArcShape): [SketchPoint, SketchPoint] {
  const at = (angle: number) => ({
    x: arc.center.x + arc.radius * Math.cos(angle),
    y: arc.center.y + arc.radius * Math.sin(angle),
  });
  return [at(arc.startAngle), at(arc.endAngle)];
}
