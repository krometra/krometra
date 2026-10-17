import type { Vec3 } from "./threadGeometry";
import { dot, scale, subtract } from "./vec3";
import type { WorkPlaneFrame } from "./workPlane";

export interface PlaneQuad {
  center: Vec3;
  u: Vec3;
  v: Vec3;
  n: Vec3;
  size: number;
  corners: Vec3[];
}

export interface Bounds {
  min: number[];
  max: number[];
}

const MIN_SIZE = 20;
const EMPTY_SIZE = 40;
const SCALE = 0.8;

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function workPlaneQuad(frame: WorkPlaneFrame, bounds: Bounds | null): PlaneQuad {
  const middle: Vec3 | null = bounds ? ([0, 1, 2].map((axis) => (bounds.min[axis] + bounds.max[axis]) / 2) as Vec3) : null;
  const center = middle ? subtract(middle, scale(frame.n, dot(subtract(middle, frame.origin), frame.n))) : frame.origin;
  const diagonal = bounds ? Math.hypot(...[0, 1, 2].map((axis) => bounds.max[axis] - bounds.min[axis])) : 0;
  const size = bounds ? Math.max(MIN_SIZE, diagonal * SCALE) : EMPTY_SIZE;
  const half = size / 2;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(add(center, scale(frame.u, a * half)), scale(frame.v, b * half)));
  return { center, u: frame.u, v: frame.v, n: frame.n, size, corners };
}
