export type Point3 = [number, number, number];

const MIN_DISTANCE = 1e-9;

export function isFinitePoint(point: Point3): boolean {
  return point.every(Number.isFinite);
}

export function isUsableCamera(position: Point3, target: Point3): boolean {
  if (!isFinitePoint(position) || !isFinitePoint(target)) return false;
  return Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]) > MIN_DISTANCE;
}

export function viewDirection(position: Point3, target: Point3, fallback: Point3): Point3 {
  const source: Point3 = isUsableCamera(position, target)
    ? [position[0] - target[0], position[1] - target[1], position[2] - target[2]]
    : fallback;
  const length = Math.hypot(...source);
  return [source[0] / length, source[1] / length, source[2] / length];
}

export function isUsableRadius(radius: number): boolean {
  return Number.isFinite(radius) && radius > MIN_DISTANCE;
}
