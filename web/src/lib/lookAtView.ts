import type { Vec3 } from "./threadGeometry";
import { cross, dot, magnitude, scale, subtract, unit } from "./vec3";
import type { Bounds, SectionBase } from "./sectionPlane";

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  up: Vec3;
}

export interface LookAtTarget {
  center: Vec3;
  normal: Vec3;
  radius: number;
}

const WORLD_UP: Vec3 = [0, 0, 1];
const VERTICAL_TOLERANCE = 0.999;
const FIT_MARGIN = 1.3;
const MIN_RADIUS = 1;
const TINY_ANGLE = 1e-6;
const EMPTY_SCENE_RADIUS = 10;

const BASE_VIEW_NORMALS: Record<SectionBase, Vec3> = {
  XY: [0, 0, 1],
  XZ: [0, -1, 0],
  YZ: [1, 0, 0],
};

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(a, scale(subtract(b, a), t));
}

export function viewUp(normal: Vec3): Vec3 {
  const vertical = dot(normal, WORLD_UP);
  if (Math.abs(vertical) > VERTICAL_TOLERANCE) return vertical > 0 ? [0, 1, 0] : [0, -1, 0];
  return unit(subtract(WORLD_UP, scale(normal, vertical))) ?? [0, 1, 0];
}

export function fitDistance(radius: number, fovDegrees: number): number {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : MIN_RADIUS;
  return (safeRadius / Math.sin((fovDegrees * Math.PI) / 360)) * FIT_MARGIN;
}

export function boundsSphere(bounds: Bounds | null): { center: Vec3; radius: number } {
  if (!bounds) return { center: [0, 0, 0], radius: EMPTY_SCENE_RADIUS };
  const center = scale(add(bounds.min, bounds.max), 0.5);
  const radius = magnitude(subtract(bounds.max, bounds.min)) / 2;
  return { center, radius: radius > 0 ? radius : EMPTY_SCENE_RADIUS };
}

export function basePlaneTarget(plane: SectionBase, bounds: Bounds | null): LookAtTarget {
  return { ...boundsSphere(bounds), normal: BASE_VIEW_NORMALS[plane] };
}

export function lookAtPose(target: LookAtTarget, fovDegrees: number): CameraPose {
  const normal = unit(target.normal) ?? WORLD_UP;
  return {
    position: add(target.center, scale(normal, fitDistance(target.radius, fovDegrees))),
    target: target.center,
    up: viewUp(normal),
  };
}

function anyPerpendicular(direction: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(direction[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return unit(cross(direction, helper)) ?? [0, 0, 1];
}

function rotate(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const parallel = scale(axis, dot(axis, vector) * (1 - cos));
  return add(add(scale(vector, cos), scale(cross(axis, vector), sin)), parallel);
}

export function slerpDirection(from: Vec3, to: Vec3, t: number, pivot: Vec3): Vec3 {
  const start = unit(from) ?? WORLD_UP;
  const end = unit(to) ?? start;
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(start, end))));
  if (angle < TINY_ANGLE) return end;
  const opposite = Math.PI - angle < TINY_ANGLE;
  const axis = (opposite ? unit(subtract(pivot, scale(start, dot(pivot, start)))) : unit(cross(start, end))) ?? anyPerpendicular(start);
  return rotate(start, axis, angle * t);
}

function safeUp(up: Vec3, direction: Vec3, fallback: Vec3): Vec3 {
  if (Math.abs(dot(up, direction)) < VERTICAL_TOLERANCE) return up;
  const projected = unit(subtract(fallback, scale(direction, dot(fallback, direction))));
  return projected ?? anyPerpendicular(direction);
}

export function interpolatePose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const fromOffset = subtract(from.position, from.target);
  const toOffset = subtract(to.position, to.target);
  const direction = slerpDirection(fromOffset, toOffset, t, from.up);
  const distance = magnitude(fromOffset) + (magnitude(toOffset) - magnitude(fromOffset)) * t;
  const target = lerp(from.target, to.target, t);
  const up = slerpDirection(from.up, to.up, t, direction);
  return {
    position: add(target, scale(direction, distance)),
    target,
    up: safeUp(up, direction, to.up),
  };
}
