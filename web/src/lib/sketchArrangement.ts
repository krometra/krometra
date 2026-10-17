import { isConstruction } from "@/sketcher/geometry";
import type { SketchEntity, SketchPoint } from "@/types/api";
import {
  CURVE_TOL,
  curveArea,
  curveCurvature,
  curveIntersections,
  curveLength,
  curvePoint,
  curveTangent,
  isClosedCurve,
  subCurve,
  type Curve,
} from "./sketchCurves";

export interface SourceCurve {
  key: string;
  curve: Curve;
}

export interface ArrangementEdge {
  curve: Curve;
  from: number;
  to: number;
  source: string;
  probeKey: string;
}

export interface Arrangement {
  vertices: SketchPoint[];
  edges: ArrangementEdge[];
  outgoing: number[][];
  position: Map<number, number>;
}

const TWO_PI = 2 * Math.PI;
const ANGLE_TIE = 1e-9;

export const twin = (halfEdge: number) => halfEdge ^ 1;
export const edgeOf = (halfEdge: number) => halfEdge >> 1;
export const isForward = (halfEdge: number) => (halfEdge & 1) === 0;

export function halfEdgeFrom(arrangement: Arrangement, halfEdge: number): number {
  const edge = arrangement.edges[edgeOf(halfEdge)];
  return isForward(halfEdge) ? edge.from : edge.to;
}

export function halfEdgeTo(arrangement: Arrangement, halfEdge: number): number {
  return halfEdgeFrom(arrangement, twin(halfEdge));
}

export function halfEdgeArea(arrangement: Arrangement, halfEdge: number): number {
  const area = curveArea(arrangement.edges[edgeOf(halfEdge)].curve);
  return isForward(halfEdge) ? area : -area;
}

export function loopArea(arrangement: Arrangement, loop: number[]): number {
  return loop.reduce((sum, halfEdge) => sum + halfEdgeArea(arrangement, halfEdge), 0);
}

function rectangleCorners(entity: Extract<SketchEntity, { type: "rectangle" }>): SketchPoint[] {
  const { corner1, corner2 } = entity;
  return [corner1, { x: corner2.x, y: corner1.y }, corner2, { x: corner1.x, y: corner2.y }];
}

function entityCurves(entity: SketchEntity): SourceCurve[] {
  if (entity.type === "line") return [{ key: entity.id, curve: { kind: "line", a: entity.start, b: entity.end } }];
  if (entity.type === "arc") {
    const sweep = entity.endAngle - entity.startAngle;
    return [{ key: entity.id, curve: { kind: "arc", c: entity.center, r: entity.radius, a0: entity.startAngle, sweep } }];
  }
  if (entity.type === "circle") {
    return [{ key: entity.id, curve: { kind: "arc", c: entity.center, r: entity.radius, a0: 0, sweep: TWO_PI } }];
  }
  if (entity.type === "rectangle") {
    const corners = rectangleCorners(entity);
    return corners.map((a, side) => ({ key: `${entity.id}.${side}`, curve: { kind: "line", a, b: corners[(side + 1) % 4] } }));
  }
  return [];
}

export function sketchSourceCurves(entities: SketchEntity[]): SourceCurve[] {
  return entities
    .filter((entity) => !isConstruction(entity))
    .flatMap(entityCurves)
    .filter((source) => curveLength(source.curve) > CURVE_TOL && (source.curve.kind === "line" || source.curve.r > CURVE_TOL));
}

function uniqueParams(params: number[], curve: Curve): number[] {
  const closed = isClosedCurve(curve);
  const length = curveLength(curve);
  const sorted = params.map((t) => (closed ? ((t % 1) + 1) % 1 : t)).sort((a, b) => a - b);
  const result: number[] = [];
  for (const t of sorted) {
    if (result.length === 0 || (t - result[result.length - 1]) * length > CURVE_TOL) result.push(t);
  }
  if (closed && result.length > 1 && (1 - result[result.length - 1] + result[0]) * length <= CURVE_TOL) result.pop();
  return result;
}

function splitParams(sources: SourceCurve[]): { params: number[]; defaultSplit: boolean }[] {
  const raw = sources.map((source) => (isClosedCurve(source.curve) ? [] : [0, 1]));
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      for (const { ta, tb } of curveIntersections(sources[i].curve, sources[j].curve)) {
        raw[i].push(ta);
        raw[j].push(tb);
      }
    }
  }
  return sources.map((source, i) => {
    const params = uniqueParams(raw[i], source.curve);
    if (!isClosedCurve(source.curve) || params.length >= 2) return { params, defaultSplit: false };
    const start = params[0] ?? 0;
    return { params: uniqueParams([start, start + 0.5], source.curve), defaultSplit: params.length === 0 };
  });
}

function pieceRanges(params: number[], closed: boolean): [number, number][] {
  const ranges = params.slice(1).map((t, i): [number, number] => [params[i], t]);
  if (closed) ranges.push([params[params.length - 1], params[0] + 1]);
  return ranges;
}

class VertexRegistry {
  readonly points: SketchPoint[] = [];
  private cells = new Map<string, number[]>();

  private cell(x: number, y: number) {
    return `${Math.floor(x / (CURVE_TOL * 4))}:${Math.floor(y / (CURVE_TOL * 4))}`;
  }

  find(point: SketchPoint): number {
    const cx = Math.floor(point.x / (CURVE_TOL * 4));
    const cy = Math.floor(point.y / (CURVE_TOL * 4));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const index of this.cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const known = this.points[index];
          if (Math.hypot(known.x - point.x, known.y - point.y) <= CURVE_TOL) return index;
        }
      }
    }
    const index = this.points.push({ x: point.x, y: point.y }) - 1;
    const key = this.cell(point.x, point.y);
    this.cells.set(key, [...(this.cells.get(key) ?? []), index]);
    return index;
  }
}

function probeKeyOf(source: SourceCurve, piece: number, pieces: number, defaultSplit: boolean): string {
  if (pieces === 1) return source.key;
  if (defaultSplit) return piece === 0 ? source.key : `${source.key}.1`;
  return `${source.key}:${piece}`;
}

function splitEdges(sources: SourceCurve[], registry: VertexRegistry): ArrangementEdge[] {
  const edges: ArrangementEdge[] = [];
  splitParams(sources).forEach(({ params, defaultSplit }, i) => {
    const source = sources[i];
    const ranges = pieceRanges(params, isClosedCurve(source.curve));
    ranges.forEach(([t0, t1], piece) => {
      const curve = subCurve(source.curve, t0, t1);
      const from = registry.find(curvePoint(curve, 0));
      const to = registry.find(curvePoint(curve, 1));
      const probeKey = probeKeyOf(source, piece, ranges.length, defaultSplit);
      if (from !== to) {
        edges.push({ curve, from, to, source: source.key, probeKey });
        return;
      }
      if (curveLength(curve) < CURVE_TOL * 10) return;
      const middle = registry.find(curvePoint(curve, 0.5));
      edges.push({ curve: subCurve(curve, 0, 0.5), from, to: middle, source: source.key, probeKey: `${probeKey}:a` });
      edges.push({ curve: subCurve(curve, 0.5, 1), from: middle, to, source: source.key, probeKey: `${probeKey}:b` });
    });
  });
  return edges;
}

function withoutDuplicates(edges: ArrangementEdge[]): ArrangementEdge[] {
  const byEnds = new Map<string, ArrangementEdge[]>();
  return edges.filter((edge) => {
    const key = edge.from < edge.to ? `${edge.from}:${edge.to}` : `${edge.to}:${edge.from}`;
    const middle = curvePoint(edge.curve, 0.5);
    const same = byEnds.get(key) ?? [];
    if (same.some((other) => {
      const otherMiddle = curvePoint(other.curve, 0.5);
      return Math.hypot(otherMiddle.x - middle.x, otherMiddle.y - middle.y) <= CURVE_TOL;
    })) return false;
    byEnds.set(key, [...same, edge]);
    return true;
  });
}

function withoutDangling(edges: ArrangementEdge[], vertexCount: number): ArrangementEdge[] {
  let kept = edges;
  for (;;) {
    const degree = new Array<number>(vertexCount).fill(0);
    for (const edge of kept) {
      degree[edge.from]++;
      degree[edge.to]++;
    }
    const next = kept.filter((edge) => degree[edge.from] > 1 && degree[edge.to] > 1);
    if (next.length === kept.length) return kept;
    kept = next;
  }
}

function departure(edges: ArrangementEdge[], halfEdge: number): { angle: number; curvature: number } {
  const edge = edges[edgeOf(halfEdge)];
  const forward = isForward(halfEdge);
  const tangent = curveTangent(edge.curve, forward ? 0 : 1);
  const angle = Math.atan2(forward ? tangent.y : -tangent.y, forward ? tangent.x : -tangent.x);
  const normalized = angle < 0 ? angle + TWO_PI : angle;
  return { angle: normalized > TWO_PI - ANGLE_TIE ? 0 : normalized, curvature: forward ? curveCurvature(edge.curve) : -curveCurvature(edge.curve) };
}

function sortedOutgoing(edges: ArrangementEdge[], vertexCount: number): number[][] {
  const outgoing = Array.from({ length: vertexCount }, () => [] as number[]);
  edges.forEach((edge, index) => {
    outgoing[edge.from].push(index * 2);
    outgoing[edge.to].push(index * 2 + 1);
  });
  return outgoing.map((list) => {
    const keyed = list.map((halfEdge) => ({ halfEdge, ...departure(edges, halfEdge) }));
    keyed.sort((a, b) => (Math.abs(a.angle - b.angle) > ANGLE_TIE ? a.angle - b.angle : a.curvature - b.curvature));
    return keyed.map((entry) => entry.halfEdge);
  });
}

export function buildArrangement(entities: SketchEntity[]): Arrangement {
  const registry = new VertexRegistry();
  const split = splitEdges(sketchSourceCurves(entities), registry);
  const edges = withoutDangling(withoutDuplicates(split), registry.points.length);
  const outgoing = sortedOutgoing(edges, registry.points.length);
  const position = new Map<number, number>();
  outgoing.forEach((list) => list.forEach((halfEdge, index) => position.set(halfEdge, index)));
  return { vertices: registry.points, edges, outgoing, position };
}

export function nextHalfEdge(arrangement: Arrangement, halfEdge: number, allowed?: Set<number>): number | null {
  const list = arrangement.outgoing[halfEdgeTo(arrangement, halfEdge)];
  const start = arrangement.position.get(twin(halfEdge))!;
  for (let step = 1; step <= list.length; step++) {
    const candidate = list[(start - step + list.length * 2) % list.length];
    if (!allowed || allowed.has(candidate)) return candidate;
  }
  return null;
}

export function traceLoops(arrangement: Arrangement, halfEdges: Iterable<number>, allowed?: Set<number>): number[][] {
  const visited = new Set<number>();
  const loops: number[][] = [];
  for (const first of halfEdges) {
    if (visited.has(first)) continue;
    const loop: number[] = [];
    let current: number | null = first;
    while (current !== null && !visited.has(current)) {
      visited.add(current);
      loop.push(current);
      current = nextHalfEdge(arrangement, current, allowed);
    }
    if (current === first) loops.push(loop);
  }
  return loops;
}

export function allHalfEdges(arrangement: Arrangement): number[] {
  return Array.from({ length: arrangement.edges.length * 2 }, (_, index) => index);
}

export function boundaryLoops(arrangement: Arrangement, halfEdges: number[]): number[][] {
  const set = new Set(halfEdges);
  const boundary = new Set(halfEdges.filter((halfEdge) => !set.has(twin(halfEdge))));
  return traceLoops(arrangement, boundary, boundary);
}
