// Кандидаты привязки: чистая логика без Vue и DOM (ROADMAP, Фаза C).
//
// Раньше привязка знала только «точку рядом» и молча возвращала координату:
// пользователь не знал, к чему привязался, а конкурирующие кандидаты в одном
// месте выигрывали случайно — маркер дрожал. Здесь у каждого кандидата есть
// тип и приоритет, а победитель выбирается детерминированно.
//
// Покрытые ROADMAP-требования по источникам точек: концы и середины отрезков
// (включая линии построения — именно поэтому «не ловился» угол грани, контур
// которой приходит construction-линиями), все четыре угла + середины сторон +
// центр прямоугольника, центр и квадранты окружности, центр и концы дуги,
// пересечения любых пар прямых.

import type { ConstraintRef, SketchEntity, SketchPoint } from "@/types/api";
import { intersectLines, lineRefOf, projectOnLine, type LineRef } from "./geometry";
import { chainedContourCenters } from "./contours";
import { SKETCH_ORIGIN, SKETCH_ORIGIN_ID } from "./sketchOrigin";

export type SnapKind =
  | "endpoint"
  | "center"
  | "centroid"
  | "origin"
  | "intersection"
  | "midpoint"
  | "quadrant"
  | "perpendicular"
  | "on-line"
  | "grid";

export interface SnapCandidate {
  point: SketchPoint;
  kind: SnapKind;
  /** Что подписать рядом с маркером. */
  label: string;
  ref?: ConstraintRef;
}

/**
 * Приоритет при конкуренции (ROADMAP): точка примитива → пересечение →
 * середина → проекция на линию → сетка. Меньше значение — важнее.
 */
const PRIORITY: Record<SnapKind, number> = {
  endpoint: 0,
  center: 0,
  centroid: 1,
  quadrant: 1,
  origin: 1,
  intersection: 2,
  midpoint: 3,
  perpendicular: 4,
  "on-line": 5,
  grid: 6,
};

export const SNAP_LABELS: Record<SnapKind, string> = {
  endpoint: "Конец",
  center: "Центр",
  centroid: "Центр контура",
  origin: "Начало координат",
  intersection: "Пересечение",
  midpoint: "Середина",
  quadrant: "Квадрант",
  perpendicular: "Перпендикуляр",
  "on-line": "На линии",
  grid: "Сетка",
};

const at = (point: SketchPoint, kind: SnapKind, owner?: string, subIndex = 0): SnapCandidate => ({
  point,
  kind,
  label: SNAP_LABELS[kind],
  ...(owner === undefined ? {} : { ref: { entity_id: owner, sub_index: subIndex } }),
});

const mid = (a: SketchPoint, b: SketchPoint): SketchPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/** Характерные точки одной сущности эскиза. */
export function entityCandidates(entity: SketchEntity): SnapCandidate[] {
  switch (entity.type) {
    case "line":
      // Линии построения тоже дают концы: контур грани приходит именно ими.
      return [
        at(entity.start, "endpoint", entity.id, 0),
        at(entity.end, "endpoint", entity.id, 1),
        at(mid(entity.start, entity.end), "midpoint", entity.id, 0),
      ];
    case "rectangle": {
      const { corner1: c1, corner2: c2 } = entity;
      const c3 = { x: c2.x, y: c1.y };
      const c4 = { x: c1.x, y: c2.y };
      return [
        at(c1, "endpoint", entity.id, 0),
        at(c2, "endpoint", entity.id, 1),
        at(c3, "endpoint", entity.id, 2),
        at(c4, "endpoint", entity.id, 3),
        at(mid(c1, c3), "midpoint"),
        at(mid(c3, c2), "midpoint"),
        at(mid(c2, c4), "midpoint"),
        at(mid(c4, c1), "midpoint"),
        at(mid(c1, c2), "center"),
      ];
    }
    case "circle": {
      const { center: c, radius: r } = entity;
      return [
        at(c, "center", entity.id, 0),
        at({ x: c.x + r, y: c.y }, "quadrant", entity.id),
        at({ x: c.x - r, y: c.y }, "quadrant", entity.id),
        at({ x: c.x, y: c.y + r }, "quadrant", entity.id),
        at({ x: c.x, y: c.y - r }, "quadrant", entity.id),
      ];
    }
    case "arc": {
      const { center: c, radius: r } = entity;
      return [
        at(c, "center", entity.id, 0),
        at(
          { x: c.x + r * Math.cos(entity.startAngle), y: c.y + r * Math.sin(entity.startAngle) },
          "endpoint",
          entity.id,
          1,
        ),
        at(
          { x: c.x + r * Math.cos(entity.endAngle), y: c.y + r * Math.sin(entity.endAngle) },
          "endpoint",
          entity.id,
          2,
        ),
      ];
    }
    default:
      return [];
  }
}

/** Все прямые эскиза: и построения, и обычные отрезки. */
export function allLineRefs(entities: SketchEntity[]): LineRef[] {
  const refs: LineRef[] = [];
  for (const e of entities) {
    const construction = lineRefOf(e, { construction: true });
    if (construction) {
      refs.push(construction);
      continue;
    }
    const plain = lineRefOf(e, { construction: false });
    if (plain) refs.push(plain);
  }
  return refs;
}

/** Пересечения любых пар прямых (вспомогательная×сторона, сторона×сторона). */
export function intersectionCandidates(entities: SketchEntity[]): SnapCandidate[] {
  const lines = allLineRefs(entities);
  const out: SnapCandidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const point = intersectLines(lines[i], lines[j]);
      if (point) out.push(at(point, "intersection"));
    }
  }
  return out;
}

const contourCentersCache = new WeakMap<SketchEntity[], SnapCandidate[]>();

/** Центры замкнутых контуров; пересчёт только при смене массива сущностей, не на каждом движении мыши. */
export function contourCenterCandidates(entities: SketchEntity[]): SnapCandidate[] {
  const cached = contourCentersCache.get(entities);
  if (cached) return cached;
  const centers = chainedContourCenters(entities).map((point) => at(point, "centroid"));
  contourCentersCache.set(entities, centers);
  return centers;
}

/** Все кандидаты эскиза: точки примитивов, центры контуров, пересечения прямых. */
export function collectCandidates(entities: SketchEntity[]): SnapCandidate[] {
  return [
    ...entities.flatMap(entityCandidates),
    ...contourCenterCandidates(entities),
    ...intersectionCandidates(entities),
    at({ ...SKETCH_ORIGIN }, "origin", SKETCH_ORIGIN_ID),
  ];
}

const distance = (a: SketchPoint, b: SketchPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentEnds(entity: SketchEntity): [SketchPoint, SketchPoint][] {
  if (entity.type === "line") return [[entity.start, entity.end]];
  if (entity.type !== "rectangle") return [];
  const { corner1: a, corner2: c } = entity;
  const b = { x: c.x, y: a.y };
  const d = { x: a.x, y: c.y };
  return [[a, b], [b, c], [c, d], [d, a]];
}

/** Foot of a radius on a finite side near the cursor. */
export function perpendicularCandidate(
  entities: SketchEntity[],
  cursor: SketchPoint,
  anchor: SketchPoint,
  threshold: number,
): SnapCandidate | null {
  let best: SnapCandidate | null = null;
  let bestDistance = Infinity;
  for (const entity of entities) {
    for (const [a, b] of segmentEnds(entity)) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq < 1e-18) continue;
      const footT = ((anchor.x - a.x) * dx + (anchor.y - a.y) * dy) / lengthSq;
      if (footT < 0 || footT > 1) continue;
      const foot = { x: a.x + footT * dx, y: a.y + footT * dy };
      if (distance(anchor, foot) < 1e-9) continue;
      const d = distance(cursor, foot);
      if (d <= threshold && d < bestDistance) {
        best = at(foot, "perpendicular");
        bestDistance = d;
      }
    }
  }
  return best;
}

/**
 * Ближайший кандидат к курсору в пределах порога.
 *
 * Ничью решает приоритет типа, а при равном приоритете — расстояние: иначе
 * маркер прыгал бы между совпавшими точками от кадра к кадру.
 */
export function pickCandidate(
  candidates: SnapCandidate[],
  cursor: SketchPoint,
  threshold: number,
): SnapCandidate | null {
  let best: SnapCandidate | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const d = distance(candidate.point, cursor);
    if (d > threshold) continue;
    if (!best) {
      best = candidate;
      bestDist = d;
      continue;
    }
    const byPriority = PRIORITY[candidate.kind] - PRIORITY[best.kind];
    // Совпадающие точки разного типа: важнее тип, а не микроскопическая разница
    // в расстоянии, иначе подпись у маркера мигает.
    if (byPriority < 0 || (byPriority === 0 && d < bestDist)) {
      best = candidate;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Полный расчёт привязки под курсором: геометрия, затем узел сетки.
 *
 * Проекция — запасной вариант: она есть всегда, поэтому не должна перебивать
 * настоящие характерные точки.
 */
export function snapAt(
  entities: SketchEntity[],
  cursor: SketchPoint,
  threshold: number,
  gridSpacing?: number,
  anchor?: SketchPoint | null,
): SnapCandidate | null {
  const candidates = collectCandidates(entities).filter((c) => !anchor || distance(c.point, anchor) > 1e-9);
  const exact = pickCandidate(candidates, cursor, threshold);
  if (exact) return exact;

  if (anchor) {
    const perpendicular = perpendicularCandidate(entities, cursor, anchor, threshold);
    if (perpendicular) return perpendicular;
  }

  const projections = entities.flatMap((entity) => {
    const line = lineRefOf(entity, { construction: true }) ?? lineRefOf(entity, { construction: false });
    if (!line) return [];
    const owner = entity.type === "line" ? entity.id : undefined;
    return [at(projectOnLine(cursor, line), "on-line", owner)];
  });
  const projection = pickCandidate(projections, cursor, threshold);
  if (projection) return projection;

  if (gridSpacing === undefined || !Number.isFinite(gridSpacing) || gridSpacing <= 0) return null;
  const grid = at({
    x: Math.round(cursor.x / gridSpacing) * gridSpacing,
    y: Math.round(cursor.y / gridSpacing) * gridSpacing,
  }, "grid");
  if (anchor && distance(grid.point, anchor) < 1e-9) return null;
  return pickCandidate([grid], cursor, threshold);
}
