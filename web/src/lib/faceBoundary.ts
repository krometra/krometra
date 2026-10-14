import type { MeshData, PlaneBasis, SketchEntity, SketchPoint } from "@/types/api";

type Vector3 = [number, number, number];

const SAME_POINT = 1e-6;
const CIRCLE_TOLERANCE = 1e-3;
const MAX_RADIUS = 1e5;
const TWO_PI = Math.PI * 2;

function project(point: Vector3, basis: PlaneBasis): SketchPoint {
  const origin = (basis.origin ?? [0, 0, 0]) as Vector3;
  const u = (basis.u ?? [1, 0, 0]) as Vector3;
  const v = (basis.v ?? [0, 1, 0]) as Vector3;
  const d: Vector3 = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
  return { x: d[0] * u[0] + d[1] * u[1] + d[2] * u[2], y: d[0] * v[0] + d[1] * v[1] + d[2] * v[2] };
}

const distance = (a: SketchPoint, b: SketchPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function polylinePoints(flat: number[], basis: PlaneBasis): SketchPoint[] {
  const points: SketchPoint[] = [];
  for (let offset = 0; offset + 2 < flat.length; offset += 3) {
    const point = project([flat[offset], flat[offset + 1], flat[offset + 2]], basis);
    if (points.length === 0 || distance(points[points.length - 1], point) > SAME_POINT) points.push(point);
  }
  return points;
}

function circleThrough(a: SketchPoint, b: SketchPoint, c: SketchPoint): { center: SketchPoint; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const sa = a.x * a.x + a.y * a.y;
  const sb = b.x * b.x + b.y * b.y;
  const sc = c.x * c.x + c.y * c.y;
  const center = {
    x: (sa * (b.y - c.y) + sb * (c.y - a.y) + sc * (a.y - b.y)) / d,
    y: (sa * (c.x - b.x) + sb * (a.x - c.x) + sc * (b.x - a.x)) / d,
  };
  const radius = distance(center, a);
  return radius < MAX_RADIUS ? { center, radius } : null;
}

function isCollinear(points: SketchPoint[]): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  const length = distance(first, last);
  if (length < SAME_POINT) return false;
  return points.every((p) => Math.abs((last.x - first.x) * (p.y - first.y) - (last.y - first.y) * (p.x - first.x)) / length < CIRCLE_TOLERANCE);
}

function fittedCircle(points: SketchPoint[]) {
  if (points.length < 4) return null;
  const n = points.length;
  const circle = circleThrough(points[0], points[Math.floor(n / 3)], points[Math.floor((2 * n) / 3)]);
  if (!circle) return null;
  const tolerance = Math.max(CIRCLE_TOLERANCE, circle.radius * 1e-3);
  return points.every((p) => Math.abs(distance(p, circle.center) - circle.radius) < tolerance) ? circle : null;
}

const angleOf = (center: SketchPoint, point: SketchPoint) => Math.atan2(point.y - center.y, point.x - center.x);
const ccwSweep = (from: number, to: number) => ((to - from) % TWO_PI + TWO_PI) % TWO_PI;

function arcAngles(center: SketchPoint, points: SketchPoint[]) {
  const first = angleOf(center, points[0]);
  const middle = angleOf(center, points[Math.floor(points.length / 2)]);
  const last = angleOf(center, points[points.length - 1]);
  const sweep = ccwSweep(first, last);
  if (ccwSweep(first, middle) < sweep) return { startAngle: first, endAngle: first + sweep };
  return { startAngle: last, endAngle: last + ccwSweep(last, first) };
}

function edgeEntities(points: SketchPoint[], id: string): SketchEntity[] {
  if (points.length < 2) return [];
  const closed = distance(points[0], points[points.length - 1]) < CIRCLE_TOLERANCE;
  if (!closed && isCollinear(points)) {
    return [{ id, type: "line", start: points[0], end: points[points.length - 1], construction: true }];
  }
  const circle = fittedCircle(points);
  if (circle && closed) return [{ id, type: "circle", ...circle, construction: true }];
  if (circle) return [{ id, type: "arc", ...circle, ...arcAngles(circle.center, points), construction: true }];
  return points.slice(1).map((end, index) => ({ id: `${id}-${index}`, type: "line", start: points[index], end, construction: true }));
}

export function faceBoundaryEntities(mesh: MeshData, faceId: string | number, basis: PlaneBasis): SketchEntity[] | null {
  const face = mesh.brep_topo.faces.find((candidate) => String(candidate.face_id) === String(faceId));
  if (!face || face.edges.length === 0) return null;
  const edges = new Map(mesh.brep_topo.edges.map((edge) => [String(edge.edge_id), edge]));
  const entities: SketchEntity[] = [];
  for (const edgeId of face.edges) {
    const polyline = edges.get(String(edgeId))?.polyline;
    if (!polyline || polyline.length < 6) return null;
    entities.push(...edgeEntities(polylinePoints(polyline, basis), `face-edge-${faceId}-${edgeId}`));
  }
  return entities;
}
