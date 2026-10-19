import type { SketchArc, SketchCircle, SketchConstraint, SketchEntity, SketchLine, SketchPoint } from "@/types/api";
import { CURVE_TOL, curveIntersections, curveLength, curvePoint, type Curve } from "@/lib/sketchCurves";
import { ccwSweep } from "./arcGeometry";
import { pickSketchEntity } from "./sketchPick";
import { dropStaleConstraints, movePointAnchors, withoutEntity, type EntityEdit } from "./staleConstraints";
import type { SketchEdit } from "./sketchFillet";

type Trimmable = SketchLine | SketchArc | SketchCircle;

interface Cut {
  t: number;
  cutterId: string | null;
}

export interface TrimTarget {
  entity: Trimmable;
  curve: Curve;
  before: Cut | null;
  after: Cut | null;
  piece: SketchEntity;
}

export interface TrimIds {
  entityId: () => string;
  constraintId: () => string;
}

const TWO_PI = 2 * Math.PI;
const INFINITE_SPAN = 1e6;

function isTrimmable(entity: SketchEntity): entity is Trimmable {
  return entity.type === "line" || entity.type === "arc" || entity.type === "circle";
}

function arcCurve(center: SketchPoint, radius: number, a0: number, sweep: number): Curve {
  return { kind: "arc", c: center, r: radius, a0, sweep };
}

function cutterCurves(entity: SketchEntity): Curve[] {
  switch (entity.type) {
    case "line":
      return [{ kind: "line", a: entity.start, b: entity.end }];
    case "arc":
      return [arcCurve(entity.center, entity.radius, entity.startAngle, ccwSweep(entity.startAngle, entity.endAngle) || TWO_PI)];
    case "circle":
      return [arcCurve(entity.center, entity.radius, 0, TWO_PI)];
    case "infline": {
      const d = { x: Math.cos(entity.angle) * INFINITE_SPAN, y: Math.sin(entity.angle) * INFINITE_SPAN };
      return [{ kind: "line", a: { x: entity.point.x - d.x, y: entity.point.y - d.y }, b: { x: entity.point.x + d.x, y: entity.point.y + d.y } }];
    }
    case "rectangle": {
      const { corner1: a, corner2: c } = entity;
      const corners = [a, { x: c.x, y: a.y }, c, { x: a.x, y: c.y }];
      return corners.map((p, i) => ({ kind: "line", a: p, b: corners[(i + 1) % 4] }));
    }
  }
}

function angleOf(center: SketchPoint, p: SketchPoint): number {
  return Math.atan2(p.y - center.y, p.x - center.x);
}

function targetCurve(entity: Trimmable, cursor: SketchPoint): Curve {
  if (entity.type === "line") return { kind: "line", a: entity.start, b: entity.end };
  if (entity.type === "circle") return arcCurve(entity.center, entity.radius, angleOf(entity.center, cursor), TWO_PI);
  return arcCurve(entity.center, entity.radius, entity.startAngle, ccwSweep(entity.startAngle, entity.endAngle) || TWO_PI);
}

function cursorParam(entity: Trimmable, curve: Curve, cursor: SketchPoint): number {
  if (curve.kind === "line") {
    const d = { x: curve.b.x - curve.a.x, y: curve.b.y - curve.a.y };
    const t = ((cursor.x - curve.a.x) * d.x + (cursor.y - curve.a.y) * d.y) / (d.x * d.x + d.y * d.y);
    return Math.min(Math.max(t, 0), 1);
  }
  if (entity.type === "circle") return 0;
  const turned = ccwSweep(curve.a0, angleOf(curve.c, cursor));
  if (turned <= curve.sweep) return turned / curve.sweep;
  return turned - curve.sweep < TWO_PI - turned ? 1 : 0;
}

function cutsAlong(entity: Trimmable, curve: Curve, entities: SketchEntity[]): Cut[] {
  const margin = CURVE_TOL / curveLength(curve);
  const cuts: Cut[] = [];
  for (const other of entities) {
    if (other.id === entity.id) continue;
    const cutterId = other.type === "rectangle" ? null : other.id;
    for (const cutter of cutterCurves(other)) {
      for (const { ta } of curveIntersections(curve, cutter)) {
        if (ta <= margin || ta >= 1 - margin) continue;
        if (!cuts.some((c) => Math.abs(c.t - ta) <= margin)) cuts.push({ t: ta, cutterId });
      }
    }
  }
  return cuts.sort((a, b) => a.t - b.t);
}

function pieceOf(entity: Trimmable, curve: Curve, from: number, to: number): SketchEntity {
  const id = `${entity.id}-trim`;
  if (curve.kind === "line") return { id, type: "line", start: curvePoint(curve, from), end: curvePoint(curve, to) };
  return { id, type: "arc", center: curve.c, radius: curve.r, startAngle: curve.a0 + curve.sweep * from, endAngle: curve.a0 + curve.sweep * to };
}

export function findTrimTarget(world: SketchPoint, entities: SketchEntity[], threshold: number): TrimTarget | null {
  const picked = pickSketchEntity(world, entities.filter(isTrimmable), threshold);
  if (!picked || !isTrimmable(picked)) return null;
  const curve = targetCurve(picked, world);
  const cuts = cutsAlong(picked, curve, entities);
  if (picked.type === "circle") {
    if (cuts.length < 2) return { entity: picked, curve, before: null, after: null, piece: picked };
    const before = cuts[cuts.length - 1];
    const after = cuts[0];
    return { entity: picked, curve, before, after, piece: pieceOf(picked, curve, before.t - 1, after.t) };
  }
  const t = cursorParam(picked, curve, world);
  const before = [...cuts].reverse().find((c) => c.t < t) ?? null;
  const after = cuts.find((c) => c.t > t) ?? null;
  return { entity: picked, curve, before, after, piece: pieceOf(picked, curve, before?.t ?? 0, after?.t ?? 1) };
}

interface Reshaped {
  entities: SketchEntity[];
  edits: EntityEdit[];
  ends: { ref: { entity_id: string; sub_index: number }; cut: Cut }[];
  links: SketchConstraint[];
  moves: { from: { entity_id: string; sub_index: number }; to: { entity_id: string; sub_index: number } }[];
}

function shortenLine(line: SketchLine, curve: Curve, before: Cut | null, after: Cut | null): Reshaped {
  const keepStart = before !== null;
  const cut = (keepStart ? before : after)!;
  const at = curvePoint(curve, cut.t);
  const subIndex = keepStart ? 1 : 0;
  return {
    entities: [keepStart ? { ...line, end: at } : { ...line, start: at }],
    edits: [{ entityId: line.id, movedSubs: [subIndex], lengthChanged: true }],
    ends: [{ ref: { entity_id: line.id, sub_index: subIndex }, cut }],
    links: [],
    moves: [],
  };
}

function shortenArc(arc: SketchArc, curve: Extract<Curve, { kind: "arc" }>, before: Cut | null, after: Cut | null): Reshaped {
  const keepStart = before !== null;
  const cut = (keepStart ? before : after)!;
  const angle = curve.a0 + curve.sweep * cut.t;
  const subIndex = keepStart ? 2 : 1;
  const reshaped: SketchArc = keepStart ? { ...arc, endAngle: angle } : { ...arc, startAngle: angle, endAngle: curve.a0 + curve.sweep };
  return {
    entities: [reshaped],
    edits: [{ entityId: arc.id, movedSubs: [subIndex], lengthChanged: true }],
    ends: [{ ref: { entity_id: arc.id, sub_index: subIndex }, cut }],
    links: [],
    moves: [],
  };
}

function splitPiece(target: TrimTarget, curve: Curve, before: Cut, after: Cut, ids: TrimIds): Reshaped {
  const { entity } = target;
  const restId = ids.entityId();
  const endSub = entity.type === "line" ? 1 : 2;
  const constraint = (type: SketchConstraint["type"], anchors: SketchConstraint["anchors"]): SketchConstraint =>
    ({ id: ids.constraintId(), type, anchors, value: null });
  let head: SketchEntity;
  let rest: SketchEntity;
  let links: SketchConstraint[];
  if (curve.kind === "line" && entity.type === "line") {
    head = { ...entity, end: curvePoint(curve, before.t) };
    rest = { ...entity, id: restId, start: curvePoint(curve, after.t) };
    links = [constraint("collinear", [{ entity_id: entity.id, sub_index: 0 }, { entity_id: restId, sub_index: 0 }])];
  } else {
    const arc = entity as SketchArc;
    const { a0, sweep } = curve as Extract<Curve, { kind: "arc" }>;
    head = { ...arc, endAngle: a0 + sweep * before.t };
    rest = { ...arc, id: restId, startAngle: a0 + sweep * after.t, endAngle: a0 + sweep };
    links = [
      constraint("coincident", [{ entity_id: entity.id, sub_index: 0 }, { entity_id: restId, sub_index: 0 }]),
      constraint("equal", [{ entity_id: entity.id, sub_index: 0 }, { entity_id: restId, sub_index: 0 }]),
    ];
  }
  return {
    entities: [head, rest],
    edits: [{ entityId: entity.id, movedSubs: [endSub], lengthChanged: true }],
    ends: [
      { ref: { entity_id: entity.id, sub_index: endSub }, cut: before },
      { ref: { entity_id: restId, sub_index: entity.type === "line" ? 0 : 1 }, cut: after },
    ],
    links,
    moves: [{ from: { entity_id: entity.id, sub_index: endSub }, to: { entity_id: restId, sub_index: endSub } }],
  };
}

function openCircle(circle: SketchCircle, curve: Extract<Curve, { kind: "arc" }>, before: Cut, after: Cut): Reshaped {
  const startAngle = curve.a0 + curve.sweep * after.t;
  const arc: SketchArc = {
    id: circle.id,
    type: "arc",
    center: circle.center,
    radius: circle.radius,
    startAngle,
    endAngle: startAngle + curve.sweep * (before.t - after.t),
    ...(circle.construction ? { construction: true } : {}),
  };
  return {
    entities: [arc],
    edits: [{ entityId: circle.id, movedSubs: [1, 2], lengthChanged: true }],
    ends: [
      { ref: { entity_id: circle.id, sub_index: 1 }, cut: after },
      { ref: { entity_id: circle.id, sub_index: 2 }, cut: before },
    ],
    links: [],
    moves: [],
  };
}

function reshape(target: TrimTarget, ids: TrimIds): Reshaped {
  const { entity, curve, before, after } = target;
  if (entity.type === "circle") return openCircle(entity, curve as Extract<Curve, { kind: "arc" }>, before!, after!);
  if (before && after) return splitPiece(target, curve, before, after, ids);
  if (entity.type === "line") return shortenLine(entity, curve, before, after);
  return shortenArc(entity, curve as Extract<Curve, { kind: "arc" }>, before, after);
}

export function applyTrim(
  target: TrimTarget,
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  ids: TrimIds,
): SketchEdit {
  const { entity } = target;
  if (!target.before && !target.after) {
    return { entities: entities.filter((e) => e.id !== entity.id), constraints: withoutEntity(constraints, entity.id) };
  }
  const reshaped = reshape(target, ids);
  const moved = reshaped.moves.reduce((list, m) => movePointAnchors(list, m.from, m.to), constraints);
  const kept = dropStaleConstraints(moved, reshaped.edits, entities);
  const onCutters = reshaped.ends.flatMap(({ ref, cut }) =>
    cut.cutterId
      ? [{ id: ids.constraintId(), type: "point_on_curve" as const, anchors: [ref, { entity_id: cut.cutterId, sub_index: 0 }], value: null }]
      : [],
  );
  const [head, ...added] = reshaped.entities;
  return {
    entities: [...entities.map((e) => (e.id === entity.id ? head : e)), ...added],
    constraints: [...kept, ...reshaped.links, ...onCutters],
  };
}
