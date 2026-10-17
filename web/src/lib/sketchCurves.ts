import type { SketchPoint } from "@/types/api";

export type Curve =
  | { kind: "line"; a: SketchPoint; b: SketchPoint }
  | { kind: "arc"; c: SketchPoint; r: number; a0: number; sweep: number };

export const CURVE_TOL = 1e-3;
const TWO_PI = 2 * Math.PI;

const mod = (value: number, period: number) => ((value % period) + period) % period;

export function isClosedCurve(curve: Curve): boolean {
  return curve.kind === "arc" && Math.abs(Math.abs(curve.sweep) - TWO_PI) < 1e-9;
}

export function curvePoint(curve: Curve, t: number): SketchPoint {
  if (curve.kind === "line") return { x: curve.a.x + (curve.b.x - curve.a.x) * t, y: curve.a.y + (curve.b.y - curve.a.y) * t };
  const angle = curve.a0 + curve.sweep * t;
  return { x: curve.c.x + curve.r * Math.cos(angle), y: curve.c.y + curve.r * Math.sin(angle) };
}

export function curveTangent(curve: Curve, t: number): SketchPoint {
  if (curve.kind === "line") {
    const length = Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y);
    return { x: (curve.b.x - curve.a.x) / length, y: (curve.b.y - curve.a.y) / length };
  }
  const angle = curve.a0 + curve.sweep * t;
  const sign = Math.sign(curve.sweep);
  return { x: -Math.sin(angle) * sign, y: Math.cos(angle) * sign };
}

export function curveCurvature(curve: Curve): number {
  return curve.kind === "line" ? 0 : Math.sign(curve.sweep) / curve.r;
}

export function curveLength(curve: Curve): number {
  if (curve.kind === "line") return Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y);
  return Math.abs(curve.sweep) * curve.r;
}

export function subCurve(curve: Curve, t0: number, t1: number): Curve {
  if (curve.kind === "line") return { kind: "line", a: curvePoint(curve, t0), b: curvePoint(curve, t1) };
  return { kind: "arc", c: curve.c, r: curve.r, a0: curve.a0 + curve.sweep * t0, sweep: curve.sweep * (t1 - t0) };
}

export function curveArea(curve: Curve): number {
  if (curve.kind === "line") return (curve.a.x * curve.b.y - curve.b.x * curve.a.y) / 2;
  const { c, r, a0, sweep } = curve;
  const a1 = a0 + sweep;
  return (c.x * r * (Math.sin(a1) - Math.sin(a0)) - c.y * r * (Math.cos(a1) - Math.cos(a0)) + r * r * sweep) / 2;
}

function arcParam(curve: Extract<Curve, { kind: "arc" }>, angle: number): number | null {
  const span = Math.abs(curve.sweep);
  const delta = curve.sweep > 0 ? mod(angle - curve.a0, TWO_PI) : mod(curve.a0 - angle, TWO_PI);
  const slack = CURVE_TOL / curve.r;
  if (isClosedCurve(curve)) return delta >= TWO_PI - slack ? 0 : delta / span;
  if (delta <= span + slack) return Math.min(delta / span, 1);
  if (delta >= TWO_PI - slack) return 0;
  return null;
}

export function curveParamOf(curve: Curve, point: SketchPoint): number | null {
  if (curve.kind === "line") {
    const dx = curve.b.x - curve.a.x;
    const dy = curve.b.y - curve.a.y;
    const length2 = dx * dx + dy * dy;
    const t = ((point.x - curve.a.x) * dx + (point.y - curve.a.y) * dy) / length2;
    const slack = CURVE_TOL / Math.sqrt(length2);
    if (t < -slack || t > 1 + slack) return null;
    const foot = curvePoint(curve, t);
    if (Math.hypot(point.x - foot.x, point.y - foot.y) > CURVE_TOL) return null;
    return Math.min(Math.max(t, 0), 1);
  }
  if (Math.abs(Math.hypot(point.x - curve.c.x, point.y - curve.c.y) - curve.r) > CURVE_TOL) return null;
  return arcParam(curve, Math.atan2(point.y - curve.c.y, point.x - curve.c.x));
}

function lineLine(a: Extract<Curve, { kind: "line" }>, b: Extract<Curve, { kind: "line" }>): SketchPoint[] {
  const d1 = { x: a.b.x - a.a.x, y: a.b.y - a.a.y };
  const d2 = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-12 * Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) return [];
  const s = ((b.a.x - a.a.x) * d2.y - (b.a.y - a.a.y) * d2.x) / cross;
  return [curvePoint(a, s)];
}

function lineCircle(line: Extract<Curve, { kind: "line" }>, arc: Extract<Curve, { kind: "arc" }>): SketchPoint[] {
  const d = { x: line.b.x - line.a.x, y: line.b.y - line.a.y };
  const length = Math.hypot(d.x, d.y);
  const u = { x: d.x / length, y: d.y / length };
  const along = (arc.c.x - line.a.x) * u.x + (arc.c.y - line.a.y) * u.y;
  const foot = { x: line.a.x + u.x * along, y: line.a.y + u.y * along };
  const distance = Math.hypot(arc.c.x - foot.x, arc.c.y - foot.y);
  if (distance > arc.r + CURVE_TOL) return [];
  const half = Math.sqrt(Math.max(arc.r * arc.r - distance * distance, 0));
  if (half < CURVE_TOL / 10) return [foot];
  return [-half, half].map((offset) => ({ x: foot.x + u.x * offset, y: foot.y + u.y * offset }));
}

function circleCircle(a: Extract<Curve, { kind: "arc" }>, b: Extract<Curve, { kind: "arc" }>): SketchPoint[] {
  const dx = b.c.x - a.c.x;
  const dy = b.c.y - a.c.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > a.r + b.r + CURVE_TOL || d < Math.abs(a.r - b.r) - CURVE_TOL) return [];
  const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
  const half = Math.sqrt(Math.max(a.r * a.r - along * along, 0));
  const base = { x: a.c.x + (dx * along) / d, y: a.c.y + (dy * along) / d };
  if (half < CURVE_TOL / 10) return [base];
  return [1, -1].map((sign) => ({ x: base.x - (sign * dy * half) / d, y: base.y + (sign * dx * half) / d }));
}

function candidatePoints(a: Curve, b: Curve): SketchPoint[] {
  if (a.kind === "line" && b.kind === "line") return lineLine(a, b);
  if (a.kind === "line" && b.kind === "arc") return lineCircle(a, b);
  if (a.kind === "arc" && b.kind === "line") return lineCircle(b, a);
  if (a.kind === "arc" && b.kind === "arc") return circleCircle(a, b);
  return [];
}

function endpoints(curve: Curve): SketchPoint[] {
  return isClosedCurve(curve) ? [] : [curvePoint(curve, 0), curvePoint(curve, 1)];
}

export function curveIntersections(a: Curve, b: Curve): { ta: number; tb: number }[] {
  const points = [...candidatePoints(a, b), ...endpoints(a), ...endpoints(b)];
  const found: { ta: number; tb: number }[] = [];
  for (const point of points) {
    const ta = curveParamOf(a, point);
    const tb = curveParamOf(b, point);
    if (ta !== null && tb !== null) found.push({ ta, tb });
  }
  return found;
}

function monotoneArcs(curve: Extract<Curve, { kind: "arc" }>): [number, number][] {
  const from = Math.min(curve.a0, curve.a0 + curve.sweep);
  const to = Math.max(curve.a0, curve.a0 + curve.sweep);
  const cuts = [from];
  for (let k = Math.ceil((from - Math.PI / 2) / Math.PI); Math.PI / 2 + k * Math.PI < to; k++) cuts.push(Math.PI / 2 + k * Math.PI);
  cuts.push(to);
  return cuts.slice(1).map((end, i) => [cuts[i], end]);
}

export function horizontalCrossings(curve: Curve, y: number): number[] {
  if (curve.kind === "line") {
    const { a, b } = curve;
    if (a.y > y === b.y > y) return [];
    return [a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)];
  }
  const { c, r } = curve;
  const xs: number[] = [];
  for (const [from, to] of monotoneArcs(curve)) {
    const y0 = c.y + r * Math.sin(from);
    const y1 = c.y + r * Math.sin(to);
    if (y0 > y === y1 > y) continue;
    const side = Math.sign(Math.cos((from + to) / 2));
    xs.push(c.x + side * Math.sqrt(Math.max(r * r - (y - c.y) * (y - c.y), 0)));
  }
  return xs;
}

export function swapAxes(curve: Curve): Curve {
  const swap = (p: SketchPoint) => ({ x: p.y, y: p.x });
  if (curve.kind === "line") return { kind: "line", a: swap(curve.a), b: swap(curve.b) };
  return { kind: "arc", c: swap(curve.c), r: curve.r, a0: Math.PI / 2 - curve.a0, sweep: -curve.sweep };
}

export function curvePolyline(curve: Curve): SketchPoint[] {
  if (curve.kind === "line") return [curve.a, curve.b];
  const steps = Math.max(2, Math.ceil(Math.abs(curve.sweep) / (Math.PI / 32)));
  return Array.from({ length: steps + 1 }, (_, i) => curvePoint(curve, i / steps));
}
