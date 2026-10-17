import type { SketchEntity, SketchPoint } from "@/types/api";
import { isConstruction } from "./geometry";

/**
 * Разбор профиля эскиза на грани: внешний контур плюс контуры-отверстия.
 *
 * Тот же разбор делает ядро на сервере (`geometry/wire_builder.py`) — здесь он
 * нужен, чтобы призрак выдавливания показывал ровно то, что построит ядро:
 * два несвязанных контура дают два тела, вложенный контур — отверстие.
 */

export interface ProfileFace {
  outer: SketchPoint[];
  holes: SketchPoint[][];
}

const JOIN_TOL = 1e-3;
const CIRCLE_SEGMENTS = 48;
const ARC_SEGMENTS = 24;

const near = (a: SketchPoint, b: SketchPoint) =>
  Math.abs(a.x - b.x) < JOIN_TOL && Math.abs(a.y - b.y) < JOIN_TOL;

function arcPoints(
  center: SketchPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number,
): SketchPoint[] {
  const points: SketchPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / segments);
    points.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return points;
}

function closedPolygon(entity: SketchEntity): SketchPoint[] | null {
  if (entity.type === "circle") {
    return arcPoints(entity.center, entity.radius, 0, 2 * Math.PI, CIRCLE_SEGMENTS).slice(0, -1);
  }
  if (entity.type === "rectangle") {
    const { corner1, corner2 } = entity;
    return [
      { x: corner1.x, y: corner1.y },
      { x: corner2.x, y: corner1.y },
      { x: corner2.x, y: corner2.y },
      { x: corner1.x, y: corner2.y },
    ];
  }
  return null;
}

function polyline(entity: SketchEntity): SketchPoint[] | null {
  if (entity.type === "line") return [entity.start, entity.end];
  if (entity.type === "arc") {
    return arcPoints(entity.center, entity.radius, entity.startAngle, entity.endAngle, ARC_SEGMENTS);
  }
  return null;
}

interface Chain {
  points: SketchPoint[];
  closed: boolean;
}

/** Цепочки из отрезков и дуг, соединённых общими концами; порядок рисования не важен. */
function chainSegments(segments: SketchPoint[][]): Chain[] {
  const rest = segments.slice();
  const chains: Chain[] = [];

  while (rest.length) {
    let points = rest.shift()!.slice();
    for (let attached = true; attached; ) {
      attached = false;
      for (let i = 0; i < rest.length; i++) {
        const seg = rest[i];
        const head = points[0];
        const tail = points[points.length - 1];
        const reversed = [...seg].reverse();
        if (near(seg[0], tail)) points = [...points, ...seg.slice(1)];
        else if (near(seg[seg.length - 1], tail)) points = [...points, ...reversed.slice(1)];
        else if (near(seg[seg.length - 1], head)) points = [...seg.slice(0, -1), ...points];
        else if (near(seg[0], head)) points = [...reversed.slice(0, -1), ...points];
        else continue;
        rest.splice(i, 1);
        attached = true;
        break;
      }
    }
    const closed = points.length > 2 && near(points[0], points[points.length - 1]);
    if (closed) points.pop();
    chains.push({ points, closed });
  }

  return chains;
}

function polygonCentroid(points: SketchPoint[]): SketchPoint | null {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-9) return null;
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

/** Центры площади замкнутых контуров из отрезков и дуг, вспомогательных тоже: контур грани приходит именно ими. */
export function chainedContourCenters(entities: SketchEntity[]): SketchPoint[] {
  const segments = entities.map(polyline).filter((p): p is SketchPoint[] => p !== null);
  return chainSegments(segments)
    .filter((chain) => chain.closed && chain.points.length >= 3)
    .map((chain) => polygonCentroid(chain.points))
    .filter((p): p is SketchPoint => p !== null);
}

export function profileContours(entities: SketchEntity[]): SketchPoint[][] {
  const profile = entities.filter((e) => !isConstruction(e));
  const standalone = profile.map(closedPolygon).filter((p): p is SketchPoint[] => p !== null);
  const segments = profile.map(polyline).filter((p): p is SketchPoint[] => p !== null);
  return [...standalone, ...chainSegments(segments).map((chain) => chain.points)].filter((c) => c.length >= 3);
}

function pointInPolygon(point: SketchPoint, polygon: SketchPoint[]): boolean {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a.y > point.y !== b.y > point.y) {
      if (point.x < a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside;
    }
  }
  return inside;
}

/**
 * Контуры → грани. Глубина вложенности контура — число контуров, внутри которых
 * он лежит: чётная даёт грань, нечётная — отверстие в ближайшем объемлющем.
 */
export function profileFaces(entities: SketchEntity[]): ProfileFace[] {
  const contours = profileContours(entities);
  const containers = contours.map((contour, i) =>
    contours.map((_, j) => j).filter((j) => j !== i && pointInPolygon(contour[0], contours[j])),
  );

  const faces = new Map<number, ProfileFace>();
  contours.forEach((contour, i) => {
    if (containers[i].length % 2 === 0) faces.set(i, { outer: contour, holes: [] });
  });
  contours.forEach((contour, i) => {
    if (containers[i].length % 2 === 0) return;
    const parent = containers[i].reduce((a, b) =>
      containers[b].length > containers[a].length ? b : a,
    );
    faces.get(parent)?.holes.push(contour);
  });

  return [...faces.values()];
}
