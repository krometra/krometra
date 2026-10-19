import type { SketchArc, SketchConstraint, SketchEntity, SketchLine, SketchPoint } from "@/types/api";
import { ccwSweep } from "./arcGeometry";
import { isConstruction } from "./geometry";
import { dropStaleConstraints } from "./staleConstraints";

export interface FilletSide {
  lineId: string;
  keep: SketchPoint;
}

export interface FilletCorner {
  at: SketchPoint;
  sides: [FilletSide, FilletSide];
}

export interface FilletIds {
  arcId: string;
  constraintId: () => string;
}

export interface SketchEdit {
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}

export type FilletResult = { ok: true; edit: SketchEdit; arc: SketchArc } | { ok: false; error: string };

const SAME_POINT = 1e-6;
const SUGGESTED_SHARE = 0.2;
const MIN_TURN = 1e-3;

const sub = (a: SketchPoint, b: SketchPoint) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: SketchPoint, b: SketchPoint) => a.x * b.x + a.y * b.y;
const along = (p: SketchPoint, d: SketchPoint, k: number) => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const distance = (a: SketchPoint, b: SketchPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (l: SketchLine) => ({ x: (l.start.x + l.end.x) / 2, y: (l.start.y + l.end.y) / 2 });

function unit(v: SketchPoint): SketchPoint | null {
  const length = Math.hypot(v.x, v.y);
  return length < 1e-12 ? null : { x: v.x / length, y: v.y / length };
}

function filletableLines(entities: SketchEntity[]): SketchLine[] {
  return entities.filter((e): e is SketchLine => e.type === "line" && !isConstruction(e));
}

export function findFilletCorner(world: SketchPoint, entities: SketchEntity[], threshold: number): FilletCorner | null {
  const lines = filletableLines(entities);
  let best: { corner: FilletCorner; gap: number } | null = null;
  for (const line of lines) {
    for (const at of [line.start, line.end]) {
      const gap = distance(at, world);
      if (gap >= threshold || (best && gap >= best.gap)) continue;
      const meeting = lines.filter((l) => distance(l.start, at) < SAME_POINT || distance(l.end, at) < SAME_POINT);
      if (meeting.length !== 2) continue;
      const sides = meeting.map((l) => ({ lineId: l.id, keep: midpoint(l) })) as [FilletSide, FilletSide];
      best = { corner: { at: { ...at }, sides }, gap };
    }
  }
  return best?.corner ?? null;
}

export function suggestFilletRadius(entities: SketchEntity[], sides: FilletSide[]): number {
  const lengths = sides.flatMap((s) => {
    const line = entities.find((e) => e.id === s.lineId);
    return line?.type === "line" ? [distance(line.start, line.end)] : [];
  });
  const shortest = lengths.length > 0 ? Math.min(...lengths) : 1;
  return Number((shortest * SUGGESTED_SHARE).toPrecision(1));
}

function intersection(a: SketchLine, b: SketchLine): SketchPoint | null {
  const d1 = sub(a.end, a.start);
  const d2 = sub(b.end, b.start);
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-12 * Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) return null;
  const s = ((b.start.x - a.start.x) * d2.y - (b.start.y - a.start.y) * d2.x) / cross;
  return along(a.start, d1, s);
}

interface Leg {
  line: SketchLine;
  dir: SketchPoint;
  cutIndex: 0 | 1;
  reach: number;
}

function legOf(line: SketchLine, keep: SketchPoint, corner: SketchPoint): Leg | null {
  const axis = unit(sub(line.end, line.start));
  if (!axis) return null;
  const side = dot(sub(keep, corner), axis);
  const dir = side < 0 ? { x: -axis.x, y: -axis.y } : axis;
  const reachStart = dot(sub(line.start, corner), dir);
  const reachEnd = dot(sub(line.end, corner), dir);
  return reachStart >= reachEnd
    ? { line, dir, cutIndex: 1, reach: reachStart }
    : { line, dir, cutIndex: 0, reach: reachEnd };
}

function cutLine(leg: Leg, at: SketchPoint): SketchLine {
  return leg.cutIndex === 0 ? { ...leg.line, start: at } : { ...leg.line, end: at };
}

const ref = (entity_id: string, sub_index: number) => ({ entity_id, sub_index });

function filletConstraints(legs: [Leg, Leg], arcSubs: [number, number], arc: SketchArc, radius: number, ids: FilletIds): SketchConstraint[] {
  const constraint = (type: SketchConstraint["type"], anchors: SketchConstraint["anchors"], value: number | null = null) =>
    ({ id: ids.constraintId(), type, anchors, value });
  return [
    ...legs.map((leg, i) => constraint("coincident", [ref(leg.line.id, leg.cutIndex), ref(arc.id, arcSubs[i])])),
    ...legs.map((leg, i) => constraint("tangent", [ref(arc.id, arcSubs[i]), ref(leg.line.id, 0)])),
    constraint("radius", [ref(arc.id, 0)], radius),
  ];
}

export function filletLines(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  sides: [FilletSide, FilletSide],
  radius: number,
  ids: FilletIds,
): FilletResult {
  const [lineA, lineB] = sides.map((s) => entities.find((e) => e.id === s.lineId));
  if (lineA?.type !== "line" || lineB?.type !== "line" || lineA.id === lineB.id) return { ok: false, error: "Нужны два разных отрезка" };
  if (!(radius > 0)) return { ok: false, error: "Радиус должен быть больше нуля" };
  const corner = intersection(lineA, lineB);
  if (!corner) return { ok: false, error: "Отрезки параллельны" };
  const legA = legOf(lineA, sides[0].keep, corner);
  const legB = legOf(lineB, sides[1].keep, corner);
  if (!legA || !legB) return { ok: false, error: "Отрезок нулевой длины" };

  const turn = Math.acos(Math.min(Math.max(dot(legA.dir, legB.dir), -1), 1));
  if (turn < MIN_TURN || Math.PI - turn < MIN_TURN) return { ok: false, error: "Отрезки лежат на одной прямой" };
  const setback = radius / Math.tan(turn / 2);
  if (setback >= Math.min(legA.reach, legB.reach) - SAME_POINT) return { ok: false, error: "Радиус слишком большой для этих отрезков" };

  const bisector = unit({ x: legA.dir.x + legB.dir.x, y: legA.dir.y + legB.dir.y })!;
  const center = along(corner, bisector, radius / Math.sin(turn / 2));
  const touchA = along(corner, legA.dir, setback);
  const touchB = along(corner, legB.dir, setback);
  const angleA = Math.atan2(touchA.y - center.y, touchA.x - center.x);
  const angleB = Math.atan2(touchB.y - center.y, touchB.x - center.x);
  const fromA = ccwSweep(angleA, angleB) < Math.PI;
  const startAngle = fromA ? angleA : angleB;
  const arc: SketchArc = {
    id: ids.arcId,
    type: "arc",
    center,
    radius,
    startAngle,
    endAngle: startAngle + ccwSweep(startAngle, fromA ? angleB : angleA),
  };

  const trimmed = new Map([[legA.line.id, cutLine(legA, touchA)], [legB.line.id, cutLine(legB, touchB)]]);
  const kept = dropStaleConstraints(
    constraints,
    [legA, legB].map((leg) => ({ entityId: leg.line.id, movedSubs: [leg.cutIndex], lengthChanged: true })),
    entities,
  );
  return {
    ok: true,
    arc,
    edit: {
      entities: [...entities.map((e) => trimmed.get(e.id) ?? e), arc],
      constraints: [...kept, ...filletConstraints([legA, legB], fromA ? [1, 2] : [2, 1], arc, radius, ids)],
    },
  };
}
