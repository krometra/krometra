import type { PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import { browserPlaneFrame } from "./browserExtrudeFrame";
import { alignedFacePlane } from "./browserFacePlane";
import type { SketchSeatPlacement } from "./browserSketchSeat";
import type { Vec3 } from "./threadGeometry";
import { cross, dot, magnitude, scale, subtract, unit } from "./vec3";

export const WORK_PLANE_TYPE = "work_plane";
export const WORK_PLANE_BASES = ["XY", "XZ", "YZ"] as const;

export interface FaceRef {
  bodyId: string;
  faceName: string;
}

export interface EdgeRef {
  bodyId: string;
  edgeName: string;
}

export type PlaneRef =
  | { kind: "base"; plane: SketchPlane }
  | ({ kind: "face" } & FaceRef)
  | { kind: "sketch"; sketchId: string };

export type AxisRef = ({ kind: "edge" } & EdgeRef) | { kind: "sketch_line"; sketchId: string; entityId: string };

export type PointRef =
  | ({ kind: "vertex"; adjacentEdgeName: string } & EdgeRef)
  | { kind: "sketch_point"; sketchId: string; entityId: string; subIndex: number };

export type WorkPlaneDefinition =
  | { kind: "offset"; reference: PlaneRef; distance: number }
  | { kind: "angle"; axis: AxisRef; reference: PlaneRef; angle: number }
  | { kind: "three_points"; points: PointRef[] }
  | { kind: "midplane"; faces: FaceRef[] };

export type WorkPlaneKind = WorkPlaneDefinition["kind"];

export interface WorkPlaneFrame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  n: Vec3;
}

export interface SketchSource {
  entities: SketchEntity[];
  placement: SketchSeatPlacement;
}

export interface WorkPlaneGeometry {
  face(ref: FaceRef): { point: Vec3; normal: Vec3 };
  edge(ref: EdgeRef): { start: Vec3; end: Vec3; straight: boolean };
  sketch(sketchId: string): SketchSource;
}

export class WorkPlaneError extends Error {}

const BASE_FRAMES: Record<SketchPlane, Omit<WorkPlaneFrame, "origin">> = {
  XY: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  XZ: { u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] },
  YZ: { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
};

const PARALLEL = 1 - 1e-6;
const DEGENERATE = 1e-9;
const NOISE = 1e-12;

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function clean(vector: Vec3): Vec3 {
  return vector.map((value) => (Math.abs(value) < NOISE ? 0 : value)) as Vec3;
}

function direction(vector: Vec3, message: string): Vec3 {
  const result = Math.hypot(...vector) > DEGENERATE ? unit(vector) : null;
  if (!result) throw new WorkPlaneError(message);
  return result;
}

function canonicalSign(vector: Vec3): Vec3 {
  const index = [0, 1, 2].reduce((best, axis) => (Math.abs(vector[axis]) > Math.abs(vector[best]) + 1e-9 ? axis : best), 0);
  return vector[index] < 0 ? scale(vector, -1) : vector;
}

function frameOf(origin: Vec3, u: Vec3, n: Vec3): WorkPlaneFrame {
  return { origin: clean(origin), u: clean(u), v: clean(cross(n, u)), n: clean(n) };
}

export function framedPlane(point: Vec3, normal: Vec3): WorkPlaneFrame {
  const n = direction(normal, "Нормаль плоскости не определена.");
  const origin = scale(n, dot(point, n));
  const aligned = alignedFacePlane(origin, n);
  if (aligned) return frameOf(origin, aligned.basis.u as Vec3, n);
  const helper: Vec3 = Math.abs(n[2]) < PARALLEL ? [0, 0, 1] : [0, 1, 0];
  return frameOf(origin, direction(cross(helper, n), "Нормаль плоскости не определена."), n);
}

function sketchFrame(source: SketchSource) {
  return browserPlaneFrame({ ...source.placement, center: { x: 0, y: 0 } });
}

function sketchWorld(source: SketchSource, point: { x: number; y: number }): Vec3 {
  const frame = sketchFrame(source);
  return add(add(frame.origin, scale(frame.u, point.x)), scale(frame.v, point.y));
}

function sketchEntity(source: SketchSource, entityId: string): SketchEntity {
  const entity = source.entities.find((candidate) => candidate.id === entityId);
  if (!entity) throw new WorkPlaneError("Линия или точка эскиза, на которую опирается плоскость, удалена.");
  return entity;
}

export function sketchPointLocal(entity: SketchEntity, subIndex: number): { x: number; y: number } | null {
  if (entity.type === "line") return subIndex === 0 ? entity.start : subIndex === 1 ? entity.end : null;
  if (entity.type === "rectangle") return subIndex === 0 ? entity.corner1 : subIndex === 1 ? entity.corner2 : null;
  if (entity.type === "circle") return subIndex === 0 ? entity.center : null;
  if (entity.type === "arc") {
    if (subIndex === 0) return entity.center;
    const angle = subIndex === 1 ? entity.startAngle : subIndex === 2 ? entity.endAngle : null;
    return angle === null ? null : { x: entity.center.x + entity.radius * Math.cos(angle), y: entity.center.y + entity.radius * Math.sin(angle) };
  }
  return null;
}

function referenceFrame(reference: PlaneRef, geometry: WorkPlaneGeometry): WorkPlaneFrame {
  if (reference.kind === "base") return { origin: [0, 0, 0], ...BASE_FRAMES[reference.plane] };
  if (reference.kind === "sketch") {
    const frame = sketchFrame(geometry.sketch(reference.sketchId));
    return { origin: frame.origin, u: frame.u, v: frame.v, n: frame.n };
  }
  const face = geometry.face(reference);
  return framedPlane(face.point, face.normal);
}

function axisLine(axis: AxisRef, geometry: WorkPlaneGeometry): { start: Vec3; end: Vec3 } {
  if (axis.kind === "edge") {
    const edge = geometry.edge(axis);
    if (!edge.straight) throw new WorkPlaneError("Ребро не прямое: ось плоскости — прямое ребро или отрезок эскиза.");
    return edge;
  }
  const source = geometry.sketch(axis.sketchId);
  const entity = sketchEntity(source, axis.entityId);
  if (entity.type !== "line") throw new WorkPlaneError("Ось плоскости — отрезок эскиза, а выбрана другая линия.");
  return { start: sketchWorld(source, entity.start), end: sketchWorld(source, entity.end) };
}

export function pointOf(ref: PointRef, geometry: WorkPlaneGeometry): Vec3 {
  if (ref.kind === "vertex") {
    const edge = geometry.edge(ref);
    const adjacent = geometry.edge({ bodyId: ref.bodyId, edgeName: ref.adjacentEdgeName });
    const gap = (point: Vec3) => Math.min(magnitude(subtract(point, adjacent.start)), magnitude(subtract(point, adjacent.end)));
    return gap(edge.start) <= gap(edge.end) ? edge.start : edge.end;
  }
  const source = geometry.sketch(ref.sketchId);
  const local = sketchPointLocal(sketchEntity(source, ref.entityId), ref.subIndex);
  if (!local) throw new WorkPlaneError("У линии эскиза нет такой точки.");
  return sketchWorld(source, local);
}

function offsetFrame(reference: PlaneRef, distance: number, geometry: WorkPlaneGeometry): WorkPlaneFrame {
  const base = referenceFrame(reference, geometry);
  return { ...base, origin: clean(add(base.origin, scale(base.n, distance))) };
}

function rotated(vector: Vec3, axis: Vec3, degrees: number): Vec3 {
  const radians = (degrees * Math.PI) / 180;
  return add(scale(vector, Math.cos(radians)), scale(cross(axis, vector), Math.sin(radians)));
}

function angleFrame(axis: AxisRef, reference: PlaneRef, angle: number, geometry: WorkPlaneGeometry): WorkPlaneFrame {
  const line = axisLine(axis, geometry);
  const along = canonicalSign(direction(subtract(line.end, line.start), "Ось плоскости вырождена: у ребра или отрезка нет длины."));
  const normal = referenceFrame(reference, geometry).n;
  const start = subtract(normal, scale(along, dot(normal, along)));
  if (Math.hypot(...start) < 1e-6) {
    throw new WorkPlaneError("Ось перпендикулярна опорной плоскости: поворот не определён. Выберите другую опорную плоскость.");
  }
  const n = direction(rotated(scale(start, 1 / Math.hypot(...start)), along, angle), "Нормаль плоскости не определена.");
  const middle = scale(add(line.start, line.end), 0.5);
  return frameOf(middle, along, n);
}

function threePointFrame(refs: PointRef[], geometry: WorkPlaneGeometry): WorkPlaneFrame {
  if (refs.length !== 3) throw new WorkPlaneError("Для плоскости по трём точкам нужны ровно три точки.");
  const [a, b, c] = refs.map((ref) => pointOf(ref, geometry));
  const n = direction(cross(subtract(b, a), subtract(c, a)), "Точки лежат на одной прямой или совпадают: плоскость через них не определена.");
  const u = direction(subtract(b, a), "Первые две точки совпадают.");
  const centroid = scale(add(add(a, b), c), 1 / 3);
  return frameOf(centroid, u, n);
}

function midFrame(refs: FaceRef[], geometry: WorkPlaneGeometry): WorkPlaneFrame {
  if (refs.length !== 2) throw new WorkPlaneError("Для средней плоскости нужны ровно две грани.");
  const [first, second] = refs.map((ref) => geometry.face(ref));
  const n = direction(first.normal, "Нормаль грани не определена.");
  if (Math.abs(dot(n, direction(second.normal, "Нормаль грани не определена."))) < PARALLEL) {
    throw new WorkPlaneError("Грани не параллельны: средняя плоскость между ними не определена.");
  }
  return framedPlane(scale(add(first.point, second.point), 0.5), n);
}

export function computeWorkPlaneFrame(definition: WorkPlaneDefinition, geometry: WorkPlaneGeometry): WorkPlaneFrame {
  if (definition.kind === "offset") return offsetFrame(definition.reference, definition.distance, geometry);
  if (definition.kind === "angle") return angleFrame(definition.axis, definition.reference, definition.angle, geometry);
  if (definition.kind === "three_points") return threePointFrame(definition.points, geometry);
  return midFrame(definition.faces, geometry);
}

export function placementOfFrame(frame: WorkPlaneFrame): SketchSeatPlacement {
  const aligned = alignedFacePlane(frame.origin, frame.n);
  const basis: PlaneBasis = { origin: [...frame.origin], u: [...frame.u], v: [...frame.v], n: [...frame.n] };
  return { plane: aligned?.plane ?? "XY", planeOffset: aligned?.planeOffset ?? 0, planeBasis: basis };
}

export function frameOfPlacement(placement: SketchSeatPlacement): WorkPlaneFrame {
  const frame = browserPlaneFrame({ ...placement, center: { x: 0, y: 0 } });
  return { origin: frame.origin, u: frame.u, v: frame.v, n: frame.n };
}

type DefinitionRef = PlaneRef | AxisRef | PointRef | FaceRef;

function bodyOfRef(ref: DefinitionRef): string | null {
  return "bodyId" in ref ? ref.bodyId : null;
}

function sketchOfRef(ref: DefinitionRef): string | null {
  return "sketchId" in ref ? ref.sketchId : null;
}

export function definitionRefs(definition: WorkPlaneDefinition): DefinitionRef[] {
  if (definition.kind === "offset") return [definition.reference];
  if (definition.kind === "angle") return [definition.axis, definition.reference];
  if (definition.kind === "three_points") return definition.points;
  return definition.faces;
}

export function definitionBodies(definition: WorkPlaneDefinition): string[] {
  return [...new Set(definitionRefs(definition).map(bodyOfRef).filter((id): id is string => id !== null))];
}

export function definitionSketches(definition: WorkPlaneDefinition): string[] {
  return [...new Set(definitionRefs(definition).map(sketchOfRef).filter((id): id is string => id !== null))];
}

export const WORK_PLANE_KIND_LABELS: Record<WorkPlaneKind, string> = {
  offset: "Смещённая",
  angle: "Под углом",
  three_points: "По трём точкам",
  midplane: "Посередине",
};
