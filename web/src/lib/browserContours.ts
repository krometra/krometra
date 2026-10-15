import { isConstruction } from "@/sketcher/geometry";
import type { SketchEntity, SketchPoint } from "@/types/api";

export type BrowserSegment =
  | { kind: "line"; start: SketchPoint; end: SketchPoint }
  | { kind: "arc"; start: SketchPoint; via: SketchPoint; end: SketchPoint };

export interface BrowserContour {
  start: SketchPoint;
  segments: BrowserSegment[];
}

export interface BrowserRegion {
  outer: BrowserContour;
  holes: BrowserContour[];
}

const JOIN_TOL = 1e-3;
const ARC_SAMPLES = 16;

const near = (a: SketchPoint, b: SketchPoint) =>
  Math.abs(a.x - b.x) < JOIN_TOL && Math.abs(a.y - b.y) < JOIN_TOL;

const polar = (center: SketchPoint, radius: number, angle: number): SketchPoint => ({
  x: center.x + radius * Math.cos(angle),
  y: center.y + radius * Math.sin(angle),
});

function lineSegments(points: SketchPoint[]): BrowserSegment[] {
  return points.map((start, i) => ({ kind: "line", start, end: points[(i + 1) % points.length] }));
}

function closedContour(entity: SketchEntity): BrowserContour | null {
  if (entity.type === "circle") {
    const east = polar(entity.center, entity.radius, 0);
    const west = polar(entity.center, entity.radius, Math.PI);
    return {
      start: east,
      segments: [
        { kind: "arc", start: east, via: polar(entity.center, entity.radius, Math.PI / 2), end: west },
        { kind: "arc", start: west, via: polar(entity.center, entity.radius, -Math.PI / 2), end: east },
      ],
    };
  }
  if (entity.type === "rectangle") {
    const { corner1, corner2 } = entity;
    const corners = [corner1, { x: corner2.x, y: corner1.y }, corner2, { x: corner1.x, y: corner2.y }];
    return { start: corners[0], segments: lineSegments(corners) };
  }
  return null;
}

export function openSegment(entity: SketchEntity): BrowserSegment | null {
  if (entity.type === "line") return { kind: "line", start: entity.start, end: entity.end };
  if (entity.type === "arc") {
    const { center, radius, startAngle, endAngle } = entity;
    return {
      kind: "arc",
      start: polar(center, radius, startAngle),
      via: polar(center, radius, (startAngle + endAngle) / 2),
      end: polar(center, radius, endAngle),
    };
  }
  return null;
}

export function reversed(segment: BrowserSegment): BrowserSegment {
  return { ...segment, start: segment.end, end: segment.start };
}

export function chainSegments(first: BrowserSegment, rest: BrowserSegment[]): BrowserSegment[] {
  let chain = [first];
  for (let attached = true; attached; ) {
    attached = false;
    const head = chain[0].start;
    const tail = chain[chain.length - 1].end;
    const index = rest.findIndex((s) => near(s.start, tail) || near(s.end, tail) || near(s.start, head) || near(s.end, head));
    if (index < 0) break;
    const [segment] = rest.splice(index, 1);
    if (near(segment.start, tail)) chain = [...chain, segment];
    else if (near(segment.end, tail)) chain = [...chain, reversed(segment)];
    else if (near(segment.end, head)) chain = [segment, ...chain];
    else chain = [reversed(segment), ...chain];
    attached = true;
  }
  return chain;
}

function chainContour(first: BrowserSegment, rest: BrowserSegment[]): BrowserContour {
  const chain = chainSegments(first, rest);
  const start = chain[0].start;
  if (!near(chain[chain.length - 1].end, start)) {
    throw new Error("Контур эскиза не замкнут — соедините концы отрезков и дуг.");
  }
  chain[chain.length - 1] = { ...chain[chain.length - 1], end: start };
  return { start, segments: chain };
}

export function browserContours(entities: SketchEntity[]): BrowserContour[] {
  const profile = entities.filter((entity) => !isConstruction(entity));
  const contours = profile.map(closedContour).filter((c): c is BrowserContour => c !== null);
  const open = profile.map(openSegment).filter((s): s is BrowserSegment => s !== null);
  while (open.length) contours.push(chainContour(open.shift()!, open));
  return contours;
}

type ArcSegment = Extract<BrowserSegment, { kind: "arc" }>;

export function arcCircle(segment: ArcSegment): { center: SketchPoint; ccw: boolean } | null {
  const { start: a, via: b, end: c } = segment;
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const sq = (p: SketchPoint) => p.x * p.x + p.y * p.y;
  const center = {
    x: (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d,
    y: (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d,
  };
  return { center, ccw: d > 0 };
}

function arcSamples(segment: ArcSegment): SketchPoint[] {
  const { start: a, end: c } = segment;
  const circle = arcCircle(segment);
  if (!circle) return [c];
  const { center, ccw } = circle;
  const radius = Math.hypot(a.x - center.x, a.y - center.y);
  const angle = (p: SketchPoint) => Math.atan2(p.y - center.y, p.x - center.x);
  const sweep = (from: number, to: number) => {
    const delta = ccw ? to - from : from - to;
    return ((delta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  };
  const total = sweep(angle(a), angle(c));
  return Array.from({ length: ARC_SAMPLES }, (_, i) => {
    const t = angle(a) + (ccw ? 1 : -1) * total * ((i + 1) / ARC_SAMPLES);
    return polar(center, radius, t);
  });
}

export function browserContourPolygon(contour: BrowserContour): SketchPoint[] {
  return contour.segments.flatMap((segment) => (segment.kind === "line" ? [segment.end] : arcSamples(segment)));
}

function pointInPolygon(point: SketchPoint, polygon: SketchPoint[]): boolean {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a.y > point.y !== b.y > point.y && point.x < a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x)) {
      inside = !inside;
    }
  }
  return inside;
}

export function browserRegions(entities: SketchEntity[]): BrowserRegion[] {
  const contours = browserContours(entities);
  const polygons = contours.map(browserContourPolygon);
  const containers = contours.map((contour, i) =>
    polygons.map((_, j) => j).filter((j) => j !== i && pointInPolygon(contour.start, polygons[j])),
  );
  const regions = new Map<number, BrowserRegion>();
  contours.forEach((contour, i) => {
    if (containers[i].length % 2 === 0) regions.set(i, { outer: contour, holes: [] });
  });
  contours.forEach((contour, i) => {
    if (containers[i].length % 2 === 0) return;
    const parent = containers[i].reduce((a, b) => (containers[b].length > containers[a].length ? b : a));
    regions.get(parent)?.holes.push(contour);
  });
  return [...regions.values()];
}
