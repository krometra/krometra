import { isConstruction } from "@/sketcher/geometry";
import type { PlaneBasis, SketchEntity, SketchPlane, SketchPoint } from "@/types/api";
import { arcCircle, chainSegments, openSegment, reversed, type BrowserSegment } from "./browserContours";
import { browserPlaneFrame, type Vector3 } from "./browserExtrudeFrame";
import { browserProfileBounds, browserProfilesOf, type BrowserProfileBounds } from "./browserProfile";
import { rotatePoint, sketchPointToWorld, type SweepProbe, type WorldProbe } from "./browserSweepNaming";

export type BrowserSweepOrientation = "corrected" | "frenet";

export interface SweepSketchPlacement {
  entities: SketchEntity[];
  plane: SketchPlane;
  planeOffset: number;
  planeBasis: PlaneBasis | null;
}

interface Frame {
  origin: Vector3;
  u: Vector3;
  v: Vector3;
  n: Vector3;
}

export interface BrowserSweepSpine {
  frame: Frame;
  segments: BrowserSegment[];
}

const ON_PLANE_TOLERANCE = 1e-3;
const MIN_LEAVE_SINE = 0.02;

const dot = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const plus = (a: Vector3, b: Vector3): Vector3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Vector3, b: Vector3): Vector3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const millimetres = (value: number) => Number(value.toFixed(2));

function unit(vector: Vector3): Vector3 {
  const length = Math.hypot(...vector);
  return length > 0 ? [vector[0] / length, vector[1] / length, vector[2] / length] : vector;
}

function frameOf(placement: SweepSketchPlacement): Frame {
  return browserPlaneFrame({ ...placement, center: { x: 0, y: 0 } });
}

function chainedPath(entities: SketchEntity[]): { segments: BrowserSegment[]; closed: boolean } {
  const visible = entities.filter((entity) => !isConstruction(entity));
  if (visible.some((entity) => entity.type !== "line" && entity.type !== "arc")) {
    throw new Error("Путь строится только из отрезков и дуг: окружности и прямоугольники в эскизе пути не поддерживаются.");
  }
  const open = visible.map(openSegment).filter((segment): segment is BrowserSegment => segment !== null);
  if (open.length === 0) throw new Error("В эскизе пути нет отрезков и дуг.");
  const segments = chainSegments(open.shift()!, open);
  if (open.length > 0) {
    throw new Error("Путь должен быть одной непрерывной цепочкой отрезков и дуг без разрывов и ветвлений.");
  }
  const first = segments[0].start;
  const last = segments[segments.length - 1].end;
  const closed = segments.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) < ON_PLANE_TOLERANCE;
  return { segments, closed };
}

function pathPoint(frame: Frame, point: SketchPoint): Vector3 {
  return sketchPointToWorld(frame, { x: 0, y: 0 }, point);
}

function reversedChain(segments: BrowserSegment[]): BrowserSegment[] {
  return [...segments].reverse().map(reversed);
}

function orientations(chain: { segments: BrowserSegment[]; closed: boolean }): BrowserSegment[][] {
  const { segments, closed } = chain;
  if (!closed) return [segments, reversedChain(segments)];
  return segments.flatMap((_, index) => {
    const rotated = [...segments.slice(index), ...segments.slice(0, index)];
    return [rotated, reversedChain(rotated)];
  });
}

function startsOnPlane(chain: { segments: BrowserSegment[]; closed: boolean }, height: (point: SketchPoint) => number) {
  const candidates = orientations(chain).filter((segments) => Math.abs(height(segments[0].start)) <= ON_PLANE_TOLERANCE);
  if (candidates.length > 0) return candidates;
  if (chain.closed) throw new Error("Замкнутый путь должен проходить вершиной через плоскость эскиза профиля.");
  const ends = [chain.segments[0].start, chain.segments[chain.segments.length - 1].end];
  const gap = millimetres(Math.min(...ends.map((point) => Math.abs(height(point)))));
  throw new Error(`Путь не начинается в плоскости профиля: ближайший конец пути в ${gap} мм от неё. Начните путь на эскизе профиля.`);
}

function profileBounds(entities: SketchEntity[]): BrowserProfileBounds {
  return browserProfilesOf(entities).map(browserProfileBounds).reduce((all, bounds) => ({
    minX: Math.min(all.minX, bounds.minX), maxX: Math.max(all.maxX, bounds.maxX),
    minY: Math.min(all.minY, bounds.minY), maxY: Math.max(all.maxY, bounds.maxY),
  }));
}

function profileGap(profile: SweepSketchPlacement, frame: Frame, start: Vector3): number {
  const offset = minus(start, frame.origin);
  const x = dot(offset, frame.u);
  const y = dot(offset, frame.v);
  const bounds = profileBounds(profile.entities);
  return Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minY - y, 0, y - bounds.maxY));
}

function tangent2d(segment: BrowserSegment, point: SketchPoint): SketchPoint {
  const circle = segment.kind === "arc" ? arcCircle(segment) : null;
  const direction = circle
    ? (circle.ccw
      ? { x: -(point.y - circle.center.y), y: point.x - circle.center.x }
      : { x: point.y - circle.center.y, y: -(point.x - circle.center.x) })
    : { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y };
  const length = Math.hypot(direction.x, direction.y);
  return { x: direction.x / length, y: direction.y / length };
}

function worldDirection(frame: Frame, direction: SketchPoint): Vector3 {
  return unit([0, 1, 2].map((axis) => frame.u[axis] * direction.x + frame.v[axis] * direction.y) as Vector3);
}

function sweepSpineTangent(spine: BrowserSweepSpine, segment: BrowserSegment, point: SketchPoint): Vector3 {
  return worldDirection(spine.frame, tangent2d(segment, point));
}

export function browserSweepSpine(profile: SweepSketchPlacement, path: SweepSketchPlacement): BrowserSweepSpine {
  const profileFrame = frameOf(profile);
  const pathFrame = frameOf(path);
  const normal = unit(profileFrame.n);
  const height = (point: SketchPoint) => dot(minus(pathPoint(pathFrame, point), profileFrame.origin), normal);
  const gap = (segments: BrowserSegment[]) => profileGap(profile, profileFrame, pathPoint(pathFrame, segments[0].start));
  const lift = (segments: BrowserSegment[]) => Math.abs(dot(worldDirection(pathFrame, tangent2d(segments[0], segments[0].start)), normal));
  const candidates = startsOnPlane(chainedPath(path.entities), height);
  const segments = candidates.find((candidate) => gap(candidate) <= ON_PLANE_TOLERANCE && lift(candidate) >= MIN_LEAVE_SINE) ?? candidates[0];
  if (gap(segments) > ON_PLANE_TOLERANCE) {
    throw new Error(`Путь начинается в плоскости профиля, но в стороне от него (в ${millimetres(gap(segments))} мм). Начните путь на контуре профиля или внутри него.`);
  }
  if (lift(segments) < MIN_LEAVE_SINE) {
    throw new Error("Путь начинается вдоль плоскости профиля: первый отрезок или дуга пути должны уходить из плоскости эскиза профиля.");
  }
  return { frame: pathFrame, segments };
}

export function sweepSpinePoint(spine: BrowserSweepSpine, point: SketchPoint): Vector3 {
  return pathPoint(spine.frame, point);
}

function middleOf(segment: BrowserSegment): SketchPoint {
  if (segment.kind === "arc") return segment.via;
  return { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
}

function signedDegrees(from: Vector3, to: Vector3, axis: Vector3): number {
  return (Math.atan2(dot(cross(from, to), axis), dot(from, to)) * 180) / Math.PI;
}

export function pipeWorldProbes(probes: SweepProbe[], profile: SweepSketchPlacement, spine: BrowserSweepSpine): WorldProbe[] {
  const profileFrame = frameOf(profile);
  const first = spine.segments[0];
  const last = spine.segments[spine.segments.length - 1];
  const origin = sweepSpinePoint(spine, first.start);
  const startTangent = sweepSpineTangent(spine, first, first.start);
  const axis = unit(spine.frame.n);
  const carry = (base: Vector3, segment: BrowserSegment, point: SketchPoint): Vector3 => {
    const turned = rotatePoint(base, origin, axis, signedDegrees(startTangent, sweepSpineTangent(spine, segment, point), axis));
    return plus(turned, minus(sweepSpinePoint(spine, point), origin));
  };
  return probes.flatMap(({ key, point }) => {
    const base = sketchPointToWorld(profileFrame, { x: 0, y: 0 }, point);
    const end = carry(base, last, last.end);
    return spine.segments.map((segment) => ({ key, start: base, middle: carry(base, segment, middleOf(segment)), end }));
  });
}
