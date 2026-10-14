import type { Vector3 } from "./browserExtrudeFrame";

export type Point2 = [number, number];

export interface SectionBasis {
  origin: Vector3;
  u: Vector3;
  v: Vector3;
  n: Vector3;
}

export interface SectionContour {
  closed: boolean;
  points: Point2[];
  length: number;
  area: number | null;
  bbox: { min: Point2; max: Point2 };
}

const JOIN_TOLERANCE = 1e-4;

const round = (value: number) => Math.round(value * 1e4) / 1e4;

export function projectPolyline(flat: number[], basis: SectionBasis): Point2[] {
  const points: Point2[] = [];
  for (let offset = 0; offset + 2 < flat.length; offset += 3) {
    const d: Vector3 = [flat[offset] - basis.origin[0], flat[offset + 1] - basis.origin[1], flat[offset + 2] - basis.origin[2]];
    const point: Point2 = [d[0] * basis.u[0] + d[1] * basis.u[1] + d[2] * basis.u[2], d[0] * basis.v[0] + d[1] * basis.v[1] + d[2] * basis.v[2]];
    const last = points[points.length - 1];
    if (!last || distance(last, point) > JOIN_TOLERANCE) points.push(point);
  }
  return points;
}

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function attach(chain: Point2[], pieces: Point2[][]): boolean {
  const head = chain[0];
  const tail = chain[chain.length - 1];
  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index];
    const first = piece[0];
    const last = piece[piece.length - 1];
    let joined: Point2[] | null = null;
    if (distance(tail, first) <= JOIN_TOLERANCE) joined = [...chain, ...piece.slice(1)];
    else if (distance(tail, last) <= JOIN_TOLERANCE) joined = [...chain, ...[...piece].reverse().slice(1)];
    else if (distance(head, last) <= JOIN_TOLERANCE) joined = [...piece, ...chain.slice(1)];
    else if (distance(head, first) <= JOIN_TOLERANCE) joined = [...[...piece].reverse(), ...chain.slice(1)];
    if (joined) {
      pieces.splice(index, 1);
      chain.splice(0, chain.length, ...joined);
      return true;
    }
  }
  return false;
}

function signedArea(points: Point2[]): number {
  let doubled = 0;
  for (let index = 0; index < points.length; index++) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    doubled += x1 * y2 - x2 * y1;
  }
  return doubled / 2;
}

function describe(points: Point2[]): SectionContour {
  const closed = points.length > 2 && distance(points[0], points[points.length - 1]) <= JOIN_TOLERANCE;
  const ring = closed ? points.slice(0, -1) : points;
  let length = 0;
  for (let index = 1; index < points.length; index++) length += distance(points[index - 1], points[index]);
  const xs = ring.map((point) => point[0]);
  const ys = ring.map((point) => point[1]);
  return {
    closed,
    points: ring.map(([x, y]) => [round(x), round(y)]),
    length: round(length),
    area: closed ? round(Math.abs(signedArea(ring))) : null,
    bbox: { min: [round(Math.min(...xs)), round(Math.min(...ys))], max: [round(Math.max(...xs)), round(Math.max(...ys))] },
  };
}

export function sectionContours(polylines: number[][], basis: SectionBasis): SectionContour[] {
  const pieces = polylines.map((flat) => projectPolyline(flat, basis)).filter((points) => points.length > 1);
  const contours: SectionContour[] = [];
  while (pieces.length > 0) {
    const chain = pieces.shift() as Point2[];
    while (attach(chain, pieces));
    contours.push(describe(chain));
  }
  return contours.sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
}
