import type { PlaneBasis, SketchCircle, SketchEntity, SketchPlane } from "@/types/api";
import { browserPlaneFrame } from "./browserExtrudeFrame";
import { sketchPointToWorld } from "./browserSweepNaming";
import { axisBasis, type Vec3 } from "./threadGeometry";
import { dot, scale, subtract } from "./vec3";

export type HoleType = "simple" | "counterbore" | "countersink";
export type HoleExtent = "distance" | "through_all";
export type HoleBottom = "flat" | "cone";
export type HoleProfilePoint = [radius: number, along: number];

export interface HoleSpec {
  type: HoleType;
  diameter: number;
  extent: HoleExtent;
  depth: number;
  bottom: HoleBottom;
  cboreDiameter: number;
  cboreDepth: number;
  csinkDiameter: number;
  csinkAngle: number;
}

export interface HoleProfile {
  points: HoleProfilePoint[];
  roles: string[];
}

export interface HoleSketchPlacement {
  entities: SketchEntity[];
  plane: SketchPlane;
  planeOffset: number;
  planeBasis: PlaneBasis | null;
}

export const DRILL_POINT_ANGLE = 118;
export const MAX_HOLES = 100;
export const THROUGH_MARGIN = 1;
const LEAD_RATIO = 0.05;
const MIN_LEAD = 0.1;
const SAME_CENTER = 1e-6;

export const HOLE_TYPES: HoleType[] = ["simple", "counterbore", "countersink"];
export const HOLE_EXTENTS: HoleExtent[] = ["distance", "through_all"];
export const HOLE_BOTTOMS: HoleBottom[] = ["flat", "cone"];

export const DEFAULT_HOLE_SPEC: HoleSpec = {
  type: "simple",
  diameter: 5,
  extent: "distance",
  depth: 10,
  bottom: "flat",
  cboreDiameter: 9,
  cboreDepth: 4,
  csinkDiameter: 10,
  csinkAngle: 90,
};

export class HoleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "HoleError";
  }
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const positive = (value: number) => Number.isFinite(value) && value > 0;
const blind = (spec: HoleSpec) => spec.extent === "distance";

export function countersinkDepth(spec: Pick<HoleSpec, "diameter" | "csinkDiameter" | "csinkAngle">): number {
  return (spec.csinkDiameter - spec.diameter) / 2 / Math.tan(radians(spec.csinkAngle / 2));
}

export function drillTipLength(diameter: number): number {
  return diameter / 2 / Math.tan(radians(DRILL_POINT_ANGLE / 2));
}

export function holeOuterDiameter(spec: HoleSpec): number {
  if (spec.type === "counterbore") return spec.cboreDiameter;
  if (spec.type === "countersink") return spec.csinkDiameter;
  return spec.diameter;
}

function validateKinds(spec: HoleSpec) {
  if (!HOLE_TYPES.includes(spec.type) || !HOLE_EXTENTS.includes(spec.extent) || !HOLE_BOTTOMS.includes(spec.bottom)) {
    throw new HoleError("bad_kind", "Неизвестный тип отверстия, предела или дна.");
  }
}

function validateCounterbore(spec: HoleSpec) {
  if (!positive(spec.cboreDiameter) || spec.cboreDiameter <= spec.diameter) {
    throw new HoleError("bad_counterbore", `Диаметр цековки должен быть больше диаметра отверстия (${spec.diameter} мм).`);
  }
  if (!positive(spec.cboreDepth)) throw new HoleError("bad_counterbore", "Глубина цековки должна быть больше нуля.");
  if (blind(spec) && spec.cboreDepth >= spec.depth) {
    throw new HoleError("bad_counterbore", `Глубина цековки ${spec.cboreDepth} мм должна быть меньше глубины отверстия ${spec.depth} мм.`);
  }
}

function validateCountersink(spec: HoleSpec) {
  if (!positive(spec.csinkDiameter) || spec.csinkDiameter <= spec.diameter) {
    throw new HoleError("bad_countersink", `Диаметр зенковки должен быть больше диаметра отверстия (${spec.diameter} мм).`);
  }
  if (!(spec.csinkAngle > 0 && spec.csinkAngle < 180)) {
    throw new HoleError("bad_countersink", "Угол зенковки задаётся в пределах от 0 до 180°.");
  }
  const sink = countersinkDepth(spec);
  if (blind(spec) && sink >= spec.depth) {
    throw new HoleError("bad_countersink", `Конус зенковки уходит на ${sink.toFixed(2)} мм — глубже самого отверстия (${spec.depth} мм).`);
  }
}

export function validateHoleSpec(spec: HoleSpec) {
  validateKinds(spec);
  if (!positive(spec.diameter)) throw new HoleError("bad_diameter", "Диаметр отверстия должен быть больше нуля.");
  if (blind(spec) && !positive(spec.depth)) throw new HoleError("bad_depth", "Глубина отверстия должна быть больше нуля.");
  if (spec.type === "counterbore") validateCounterbore(spec);
  if (spec.type === "countersink") validateCountersink(spec);
}

function holeMouth(spec: HoleSpec): { points: HoleProfilePoint[]; roles: string[] } {
  const radius = spec.diameter / 2;
  if (spec.type === "counterbore") {
    const outer = spec.cboreDiameter / 2;
    return { points: [[outer, spec.cboreDepth], [radius, spec.cboreDepth]], roles: ["cbore-wall", "cbore-floor"] };
  }
  if (spec.type === "countersink") {
    return { points: [[spec.csinkDiameter / 2, 0], [radius, countersinkDepth(spec)]], roles: ["csink-rim", "csink"] };
  }
  return { points: [], roles: [] };
}

function holeEnd(spec: HoleSpec, length: number): { point: HoleProfilePoint; role: string } {
  if (!blind(spec)) return { point: [0, length], role: "exit" };
  if (spec.bottom === "cone") return { point: [0, length + drillTipLength(spec.diameter)], role: "tip" };
  return { point: [0, length], role: "floor" };
}

export function holeProfile(spec: HoleSpec, throughDepth: number): HoleProfile {
  validateHoleSpec(spec);
  const outer = holeOuterDiameter(spec) / 2;
  const lead = Math.max(MIN_LEAD, outer * LEAD_RATIO);
  const length = blind(spec) ? spec.depth : throughDepth;
  if (!positive(length)) throw new HoleError("bad_depth", "Глубина отверстия должна быть больше нуля.");
  const mouth = holeMouth(spec);
  const end = holeEnd(spec, length);
  return {
    points: [[0, -lead], [outer, -lead], ...mouth.points, [spec.diameter / 2, length], end.point],
    roles: ["cap", ...mouth.roles, "wall", end.role],
  };
}

export function bboxCorners(min: number[], max: number[]): Vec3[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => [0, 1, 2].map((axis) => ((mask >> axis) & 1 ? max[axis] : min[axis])) as Vec3);
}

export function holeThroughDepth(corners: Vec3[], center: Vec3, axis: Vec3): number {
  const reach = Math.max(0, ...corners.map((corner) => dot(subtract(corner, center), axis)));
  return reach + THROUGH_MARGIN;
}

export function projectOntoPlane(point: Vec3, origin: Vec3, normal: Vec3): Vec3 {
  return subtract(point, scale(normal, dot(subtract(point, origin), normal)));
}

export function holePoint(center: Vec3, axis: Vec3, [radius, along]: HoleProfilePoint, angle: number): Vec3 {
  const { u, v } = axisBasis(axis);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [0, 1, 2].map((index) => center[index] + axis[index] * along + radius * (u[index] * cos + v[index] * sin)) as Vec3;
}

export function holePolygon(profile: HoleProfile, center: Vec3, axis: Vec3): Vec3[] {
  return profile.points.map((point) => holePoint(center, axis, point, 0));
}

export function holeRoleProbes(profile: HoleProfile, center: Vec3, axis: Vec3): { key: string; point: Vec3 }[] {
  return profile.roles.map((role, index) => {
    const [fromRadius, fromAlong] = profile.points[index];
    const [toRadius, toAlong] = profile.points[index + 1];
    const middle: HoleProfilePoint = [(fromRadius + toRadius) / 2, (fromAlong + toAlong) / 2];
    return { key: role, point: holePoint(center, axis, middle, Math.PI / 2) };
  });
}

export function sketchHoleCenters(placement: HoleSketchPlacement): Vec3[] {
  const frame = browserPlaneFrame({ ...placement, center: { x: 0, y: 0 } });
  return placement.entities
    .filter((entity): entity is SketchCircle => entity.type === "circle")
    .map((entity) => sketchPointToWorld(frame, { x: 0, y: 0 }, entity.center));
}

export interface HolePreview {
  center: Vec3;
  axis: Vec3;
  points: HoleProfilePoint[];
}

export function holePreviews(spec: HoleSpec, centers: Vec3[], axis: Vec3, corners: Vec3[]): HolePreview[] {
  return centers.map((center) => ({ center, axis, points: holeProfile(spec, holeThroughDepth(corners, center, axis)).points }));
}

export function distinctCenters(centers: Vec3[]): Vec3[] {
  return centers.filter((center, index) => centers.findIndex((other) => (
    Math.hypot(...subtract(center, other)) < SAME_CENTER
  )) === index);
}
