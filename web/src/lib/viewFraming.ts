import { isFinitePoint, isUsableRadius, type Point3 } from "./cameraGuard";

export interface FrameSphere {
  center: Point3;
  radius: number;
}

export interface FramedView {
  position: Point3;
  target: Point3;
  distance: number;
}

const FIT_MARGIN = 1.4;

function normalized(direction: Point3): Point3 | null {
  const length = Math.hypot(...direction);
  return length > 1e-12 && Number.isFinite(length) ? [direction[0] / length, direction[1] / length, direction[2] / length] : null;
}

export function fitDistance(radius: number, fovDeg: number): number {
  return (radius / Math.sin((fovDeg * Math.PI) / 360)) * FIT_MARGIN;
}

export function framedView(
  direction: Point3,
  sphere: FrameSphere | null,
  fallback: { target: Point3; distance: number },
  fovDeg: number,
): FramedView | null {
  const dir = normalized(direction);
  if (!dir) return null;
  const usable = sphere !== null && isUsableRadius(sphere.radius) && isFinitePoint(sphere.center);
  const target = usable ? sphere.center : fallback.target;
  const distance = usable ? fitDistance(sphere.radius, fovDeg) : fallback.distance;
  if (!isFinitePoint(target) || !(distance > 0) || !Number.isFinite(distance)) return null;
  return {
    target,
    distance,
    position: [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance],
  };
}
