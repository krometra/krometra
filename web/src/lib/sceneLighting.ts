import type { Vec3 } from "./threadGeometry";
import { cross, dot, magnitude, scale, subtract, unit } from "./vec3";

export interface Bounds3 {
  min: Vec3;
  max: Vec3;
}

export interface ShadowRig {
  target: Vec3;
  position: Vec3;
  halfExtent: number;
  near: number;
  far: number;
  normalBias: number;
  floor: { z: number; center: [number, number]; size: number };
}

const KEY_SIDE = 0.35;
const KEY_RISE = 0.5;
const FILL_SIDE = -0.6;
const FILL_RISE = -0.25;
const LIGHT_DISTANCE_RADII = 4;
const MIN_FLOOR_ELEVATION = 0.15;
const MAX_FLOOR_REACH_RADII = 3;
const EXTENT_MARGIN = 1.05;
const NORMAL_BIAS_TEXELS = 1.5;
const FLOOR_GAP_RADII = 0.002;
const MIN_RADIUS = 1e-3;
const FALLBACK_UP: Vec3 = [0, 0, 1];

function sum(...vectors: Vec3[]): Vec3 {
  return vectors.reduce<Vec3>((total, v) => [total[0] + v[0], total[1] + v[1], total[2] + v[2]], [0, 0, 0]);
}

function cameraFrame(forward: Vec3, up: Vec3) {
  const ahead = unit(forward) ?? [0, 0, -1];
  const right = unit(cross(ahead, up)) ?? unit(cross(ahead, FALLBACK_UP)) ?? [1, 0, 0];
  const screenUp = cross(right, ahead);
  return { back: scale(ahead, -1), right, screenUp };
}

function lightFromCamera(forward: Vec3, up: Vec3, side: number, rise: number): Vec3 {
  const { back, right, screenUp } = cameraFrame(forward, up);
  return unit(sum(back, scale(right, side), scale(screenUp, rise)))!;
}

export function keyLightDirection(forward: Vec3, up: Vec3): Vec3 {
  return lightFromCamera(forward, up, KEY_SIDE, KEY_RISE);
}

export function fillLightDirection(forward: Vec3, up: Vec3): Vec3 {
  return lightFromCamera(forward, up, FILL_SIDE, FILL_RISE);
}

function corners({ min, max }: Bounds3): Vec3[] {
  const result: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) result.push([x, y, z]);
  return result;
}

function boundsCenter({ min, max }: Bounds3): Vec3 {
  return scale(sum(min, max), 0.5);
}

function boundsRadius(bounds: Bounds3): number {
  return Math.max(magnitude(subtract(bounds.max, bounds.min)) / 2, MIN_RADIUS);
}

function dropToFloor(point: Vec3, lightDir: Vec3, floorZ: number, reach: number): Vec3 | null {
  if (lightDir[2] < MIN_FLOOR_ELEVATION) return null;
  const travel = Math.min((point[2] - floorZ) / lightDir[2], reach);
  return subtract(point, scale(lightDir, travel));
}

export function floorZ(bounds: Bounds3): number {
  return bounds.min[2] - boundsRadius(bounds) * FLOOR_GAP_RADII;
}

export function shadowRig(bounds: Bounds3, lightDir: Vec3, mapSize: number): ShadowRig {
  const center = boundsCenter(bounds);
  const radius = boundsRadius(bounds);
  const floor = floorZ(bounds);
  const reach = radius * MAX_FLOOR_REACH_RADII;
  const box = corners(bounds);
  const shadowed = box.map((corner) => dropToFloor(corner, lightDir, floor, reach)).filter((point): point is Vec3 => point !== null);
  const points = [...box, ...shadowed];

  const distance = radius * LIGHT_DISTANCE_RADII;
  const offsets = points.map((point) => subtract(point, center));
  const along = offsets.map((offset) => dot(offset, lightDir));
  const across = offsets.map((offset, index) => magnitude(subtract(offset, scale(lightDir, along[index]))));
  const halfExtent = Math.max(...across, MIN_RADIUS) * EXTENT_MARGIN;
  const margin = radius * 0.1;
  const texel = (2 * halfExtent) / mapSize;

  return {
    target: center,
    position: sum(center, scale(lightDir, distance)),
    halfExtent,
    near: Math.max(distance - Math.max(...along) - margin, MIN_RADIUS),
    far: distance - Math.min(...along) + margin,
    normalBias: texel * NORMAL_BIAS_TEXELS,
    floor: { z: floor, center: [center[0], center[1]], size: halfExtent * 4 },
  };
}

export function floorShadowVisible(lightDir: Vec3, cameraZ: number, floor: number): boolean {
  return lightDir[2] >= MIN_FLOOR_ELEVATION && cameraZ > floor;
}

export function sameDirection(a: Vec3, b: Vec3, toleranceDeg = 0.25): boolean {
  return dot(a, b) >= Math.cos((toleranceDeg * Math.PI) / 180);
}

export function sameBounds(a: Bounds3, b: Bounds3): boolean {
  const tolerance = boundsRadius(a) * 1e-6;
  return [0, 1, 2].every((axis) => Math.abs(a.min[axis] - b.min[axis]) <= tolerance && Math.abs(a.max[axis] - b.max[axis]) <= tolerance);
}
