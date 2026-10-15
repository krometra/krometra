export interface Vec {
  x: number;
  y: number;
}

export interface Seg {
  start: Vec;
  end: Vec;
}

export const segLength = (s: Seg) => Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y);

export function unitDirection(s: Seg): Vec | null {
  const length = segLength(s);
  if (length < 1e-9) return null;
  return { x: (s.end.x - s.start.x) / length, y: (s.end.y - s.start.y) / length };
}

export function unitNormal(s: Seg): Vec | null {
  const dir = unitDirection(s);
  return dir ? { x: -dir.y, y: dir.x } : null;
}

export function signedPointLineDistance(p: Vec, line: Seg): number | null {
  const n = unitNormal(line);
  if (!n) return null;
  return (p.x - line.start.x) * n.x + (p.y - line.start.y) * n.y;
}

export function signedLineDistance(base: Seg, other: Seg): number | null {
  const d0 = signedPointLineDistance(other.start, base);
  const d1 = signedPointLineDistance(other.end, base);
  return d0 === null || d1 === null ? null : (d0 + d1) / 2;
}

export function sideSign(value: number): 1 | -1 {
  return value < 0 ? -1 : 1;
}

export function wrapTurn(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= 2 * Math.PI;
  while (result <= -Math.PI) result += 2 * Math.PI;
  return result;
}

export function rayAngleBetween(first: Seg, second: Seg): number {
  const a = Math.atan2(first.end.y - first.start.y, first.end.x - first.start.x);
  const b = Math.atan2(second.end.y - second.start.y, second.end.x - second.start.x);
  return wrapTurn(b - a);
}

export function lineIntersection(a: Seg, b: Seg): Vec | null {
  const da = { x: a.end.x - a.start.x, y: a.end.y - a.start.y };
  const db = { x: b.end.x - b.start.x, y: b.end.y - b.start.y };
  const cross = da.x * db.y - da.y * db.x;
  if (Math.abs(cross) < 1e-12) return null;
  const t = ((b.start.x - a.start.x) * db.y - (b.start.y - a.start.y) * db.x) / cross;
  return { x: a.start.x + da.x * t, y: a.start.y + da.y * t };
}

export function areParallel(a: Seg, b: Seg, toleranceRad = 0.5 * (Math.PI / 180)): boolean {
  const da = unitDirection(a);
  const db = unitDirection(b);
  if (!da || !db) return false;
  return Math.abs(da.x * db.y - da.y * db.x) < Math.sin(toleranceRad);
}

export const RAD_TO_DEG = 180 / Math.PI;
