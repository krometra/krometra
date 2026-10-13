import { isConstruction } from "@/sketcher/geometry";
import type { SketchEntity, SketchPoint } from "@/types/api";
import type { GeneratedFaces } from "./browserNaming";
import type { Vector3 } from "./browserExtrudeFrame";

export interface SweepProbe {
  key: string;
  point: SketchPoint;
}

export interface ProbeHits {
  key: string;
  start: number[];
  middle: number[];
  end: number[];
}

export interface WorldProbe {
  key: string;
  start: Vector3;
  middle: Vector3;
  end: Vector3;
}

export type SweepPath =
  | { kind: "prism"; direction: Vector3; length: number }
  | { kind: "revolution"; axisOrigin: Vector3; axis: Vector3; angle: number; startAngle: number };

const polar = (center: SketchPoint, radius: number, angle: number): SketchPoint => ({
  x: center.x + radius * Math.cos(angle),
  y: center.y + radius * Math.sin(angle),
});

const midpoint = (a: SketchPoint, b: SketchPoint): SketchPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function entityProbes(entity: SketchEntity): SweepProbe[] {
  if (entity.type === "line") return [{ key: entity.id, point: midpoint(entity.start, entity.end) }];
  if (entity.type === "arc") {
    return [{ key: entity.id, point: polar(entity.center, entity.radius, (entity.startAngle + entity.endAngle) / 2) }];
  }
  if (entity.type === "circle") {
    return [
      { key: entity.id, point: polar(entity.center, entity.radius, Math.PI / 2) },
      { key: `${entity.id}.1`, point: polar(entity.center, entity.radius, -Math.PI / 2) },
    ];
  }
  if (entity.type === "rectangle") {
    const { corner1, corner2 } = entity;
    const corners = [corner1, { x: corner2.x, y: corner1.y }, corner2, { x: corner1.x, y: corner2.y }];
    return corners.map((corner, side) => ({ key: `${entity.id}.${side}`, point: midpoint(corner, corners[(side + 1) % 4]) }));
  }
  return [];
}

export function sweepProbes(entities: SketchEntity[]): SweepProbe[] {
  return entities.filter((entity) => !isConstruction(entity)).flatMap(entityProbes);
}

export function sketchPointToWorld(
  frame: { origin: Vector3; u: Vector3; v: Vector3 },
  center: SketchPoint,
  point: SketchPoint,
): Vector3 {
  const x = point.x - center.x;
  const y = point.y - center.y;
  return [0, 1, 2].map((axis) => frame.origin[axis] + frame.u[axis] * x + frame.v[axis] * y) as Vector3;
}

export function rotatePoint(point: Vector3, origin: Vector3, axis: Vector3, degrees: number): Vector3 {
  const length = Math.hypot(...axis);
  const k = axis.map((value) => value / length) as Vector3;
  const p = point.map((value, index) => value - origin[index]) as Vector3;
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = k[0] * p[0] + k[1] * p[1] + k[2] * p[2];
  const cross: Vector3 = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]];
  return [0, 1, 2].map((index) => (
    origin[index] + p[index] * cos + cross[index] * sin + k[index] * dot * (1 - cos)
  )) as Vector3;
}

export function sweepPoint(start: Vector3, path: SweepPath, fraction: number): Vector3 {
  if (path.kind === "prism") {
    return start.map((value, index) => value + path.direction[index] * path.length * fraction) as Vector3;
  }
  return rotatePoint(start, path.axisOrigin, path.axis, path.startAngle + path.angle * fraction);
}

export function worldProbes(
  probes: SweepProbe[],
  frame: { origin: Vector3; u: Vector3; v: Vector3 },
  center: SketchPoint,
  path: SweepPath,
): WorldProbe[] {
  return probes.map(({ key, point }) => {
    const base = sketchPointToWorld(frame, center, point);
    return { key, start: sweepPoint(base, path, 0), middle: sweepPoint(base, path, 0.5), end: sweepPoint(base, path, 1) };
  });
}

function groupByKey(entries: { key: string; face: number }[]): GeneratedFaces[] {
  const groups = new Map<string, number[]>();
  for (const { key, face } of entries) groups.set(key, [...(groups.get(key) ?? []), face]);
  return [...groups].map(([key, images]) => ({ key, images }));
}

function capKey(face: number, hits: ProbeHits[], role: "start" | "end"): string | null {
  const keys = hits.filter((probe) => probe[role].includes(face)).map((probe) => probe.key).sort();
  return keys.length > 0 ? `${role}:${keys[0]}` : null;
}

export function sweepGeneratedFaces(faceCount: number, hits: ProbeHits[]): GeneratedFaces[] {
  const sideOf = new Map<number, string>();
  for (const probe of hits) {
    for (const face of probe.middle) {
      if (!sideOf.has(face)) sideOf.set(face, `side:${probe.key}`);
    }
  }
  const entries: { key: string; face: number }[] = [];
  for (let face = 0; face < faceCount; face++) {
    const key = sideOf.get(face) ?? capKey(face, hits, "start") ?? capKey(face, hits, "end");
    if (key) entries.push({ key, face });
  }
  return groupByKey(entries);
}
