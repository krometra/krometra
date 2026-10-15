import type { Vec3 } from "./threadGeometry";
import { dot, scale, subtract } from "./vec3";
import { boundsSphere, type LookAtTarget } from "./lookAtView";

export type SectionBase = "XY" | "XZ" | "YZ";

export interface SectionAnchor {
  origin: Vec3;
  normal: Vec3;
}

export interface ClipPlane {
  normal: Vec3;
  constant: number;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export interface OffsetRange {
  min: number;
  max: number;
}

const BASE_NORMALS: Record<SectionBase, Vec3> = {
  XY: [0, 0, 1],
  XZ: [0, 1, 0],
  YZ: [1, 0, 0],
};

const RANGE_STEPS = 200;

export function baseAnchor(plane: SectionBase): SectionAnchor {
  return { origin: [0, 0, 0], normal: BASE_NORMALS[plane] };
}

function corners(bounds: Bounds): Vec3[] {
  const result: Vec3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) result.push([x, y, z]);
    }
  }
  return result;
}

export function offsetRange(anchor: SectionAnchor, bounds: Bounds | null): OffsetRange {
  if (!bounds) return { min: 0, max: 0 };
  const levels = corners(bounds).map((corner) => dot(subtract(corner, anchor.origin), anchor.normal));
  return { min: Math.min(...levels), max: Math.max(...levels) };
}

export function middleOffset(range: OffsetRange): number {
  return (range.min + range.max) / 2;
}

export function offsetStep(range: OffsetRange): number {
  const span = range.max - range.min;
  return span > 0 ? span / RANGE_STEPS : 0.1;
}

export function clampOffset(offset: number, range: OffsetRange): number {
  if (!Number.isFinite(offset)) return middleOffset(range);
  return Math.min(Math.max(offset, range.min), range.max);
}

export function sectionPoint(anchor: SectionAnchor, offset: number): Vec3 {
  const shift = scale(anchor.normal, offset);
  return [anchor.origin[0] + shift[0], anchor.origin[1] + shift[1], anchor.origin[2] + shift[2]];
}

export function clipPlane(anchor: SectionAnchor, offset: number, flipped: boolean): ClipPlane {
  const kept = flipped ? anchor.normal : scale(anchor.normal, -1);
  return { normal: kept, constant: -dot(kept, sectionPoint(anchor, offset)) };
}

export function flipFacingCamera(anchor: SectionAnchor, offset: number, camera: Vec3): boolean {
  return dot(subtract(camera, sectionPoint(anchor, offset)), anchor.normal) < 0;
}

export function isClipped(point: Vec3, plane: ClipPlane, tolerance = 0): boolean {
  return dot(plane.normal, point) + plane.constant < -tolerance;
}

export function sectionViewTarget(anchor: SectionAnchor, offset: number, flipped: boolean, bounds: Bounds | null): LookAtTarget {
  const { center, radius } = boundsSphere(bounds);
  const clip = clipPlane(anchor, offset, flipped);
  const onPlane = subtract(center, scale(clip.normal, dot(clip.normal, center) + clip.constant));
  return { center: onPlane, normal: scale(clip.normal, -1), radius };
}
