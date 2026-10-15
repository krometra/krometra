import type { MeasureRef } from "./measure";
import type { Vec3 } from "./threadGeometry";

export type ScreenPoint = [number, number];

export const VERTEX_PICK_RADIUS_PX = 10;
export const MAX_PICKS = 2;

export interface ProjectedPoint {
  world: Vec3;
  screen: ScreenPoint | null;
}

export interface EdgeTrace {
  bodyId: string;
  edgeId: string;
  points: ProjectedPoint[];
}

export interface Candidate<T> {
  target: T;
  world: Vec3;
  px: number;
}

const SAME_POINT = 1e-6;

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function segmentHit(a: ScreenPoint, b: ScreenPoint, cursor: ScreenPoint): { px: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? Math.min(1, Math.max(0, ((cursor[0] - a[0]) * dx + (cursor[1] - a[1]) * dy) / lengthSq)) : 0;
  return { px: Math.hypot(a[0] + dx * t - cursor[0], a[1] + dy * t - cursor[1]), t };
}

function nearestOnTrace(trace: EdgeTrace, cursor: ScreenPoint): { px: number; world: Vec3 } | null {
  let best: { px: number; world: Vec3 } | null = null;
  for (let i = 1; i < trace.points.length; i++) {
    const a = trace.points[i - 1];
    const b = trace.points[i];
    if (!a.screen || !b.screen) continue;
    const hit = segmentHit(a.screen, b.screen, cursor);
    if (!best || hit.px < best.px) best = { px: hit.px, world: lerp(a.world, b.world, hit.t) };
  }
  return best;
}

const byDistance = <T>(a: Candidate<T>, b: Candidate<T>) => a.px - b.px;

export function edgeCandidates(traces: EdgeTrace[], cursor: ScreenPoint, radiusPx: number): Candidate<MeasureRef>[] {
  return traces
    .flatMap((trace) => {
      const hit = nearestOnTrace(trace, cursor);
      return hit && hit.px <= radiusPx
        ? [{ target: { kind: "edge" as const, bodyId: trace.bodyId, edgeId: trace.edgeId }, world: hit.world, px: hit.px }]
        : [];
    })
    .sort(byDistance);
}

export function vertexCandidates(traces: EdgeTrace[], cursor: ScreenPoint, radiusPx: number): Candidate<MeasureRef>[] {
  return traces
    .flatMap((trace) => [trace.points[0], trace.points[trace.points.length - 1]].flatMap((point) => {
      if (!point?.screen) return [];
      const px = Math.hypot(point.screen[0] - cursor[0], point.screen[1] - cursor[1]);
      return px <= radiusPx ? [{ target: { kind: "vertex" as const, bodyId: trace.bodyId, point: point.world }, world: point.world, px }] : [];
    }))
    .sort(byDistance);
}

export function firstVisible<T>(candidates: Candidate<T>[], isVisible: (world: Vec3) => boolean, limit = 4): Candidate<T> | null {
  return candidates.slice(0, limit).find((candidate) => isVisible(candidate.world)) ?? null;
}

function samePoint(a: Vec3, b: Vec3): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < SAME_POINT;
}

export function samePick(a: MeasureRef | null, b: MeasureRef | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind || a.bodyId !== b.bodyId) return false;
  if (a.kind === "vertex" && b.kind === "vertex") return samePoint(a.point, b.point);
  if (a.kind === "edge" && b.kind === "edge") return a.edgeId === b.edgeId;
  if (a.kind === "face" && b.kind === "face") return a.faceId === b.faceId;
  return a.kind === "body";
}

export function nextPicks(current: MeasureRef[], pick: MeasureRef | null): MeasureRef[] {
  if (!pick) return [];
  if (current.some((existing) => samePick(existing, pick))) return current.filter((existing) => !samePick(existing, pick));
  return current.length < MAX_PICKS ? [...current, pick] : [pick];
}
