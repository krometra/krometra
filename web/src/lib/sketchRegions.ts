import type { SketchEntity, SketchPoint } from "@/types/api";
import type { BrowserContour, BrowserRegion, BrowserSegment } from "./browserContours";
import {
  allHalfEdges,
  boundaryLoops,
  buildArrangement,
  edgeOf,
  halfEdgeFrom,
  halfEdgeTo,
  isForward,
  loopArea,
  traceLoops,
  twin,
  type Arrangement,
} from "./sketchArrangement";
import { curvePoint, curvePolyline, horizontalCrossings, swapAxes, type Curve } from "./sketchCurves";

export interface SketchRegion {
  key: string;
  area: number;
  point: SketchPoint;
  outer: BrowserContour;
  holes: BrowserContour[];
}

export interface RegionPolygon {
  outer: SketchPoint[];
  holes: SketchPoint[][];
}

interface Face {
  outer: number[];
  holes: number[][];
  outerArea: number;
}

export interface RegionLayout {
  arrangement: Arrangement;
  faces: Face[];
  regions: SketchRegion[];
}

const AREA_EPS = 1e-9;
const SCANLINES = 24;

function loopCurves(arrangement: Arrangement, loop: number[]): Curve[] {
  return loop.map((halfEdge) => arrangement.edges[edgeOf(halfEdge)].curve);
}

function crossingsAt(curves: Curve[], y: number): number[] {
  return curves.flatMap((curve) => horizontalCrossings(curve, y));
}

function insideCurves(curves: Curve[], point: SketchPoint): boolean {
  return crossingsAt(curves, point.y).filter((x) => x > point.x).length % 2 === 1;
}

function halfEdgeMiddle(arrangement: Arrangement, halfEdge: number): SketchPoint {
  return curvePoint(arrangement.edges[edgeOf(halfEdge)].curve, 0.5);
}

function smallestContaining(
  arrangement: Arrangement,
  outers: { loop: number[]; area: number }[],
  point: SketchPoint,
  skip: (index: number) => boolean,
): number | null {
  let best: number | null = null;
  outers.forEach((outer, index) => {
    if (skip(index) || !insideCurves(loopCurves(arrangement, outer.loop), point)) return;
    if (best === null || outer.area < outers[best].area) best = index;
  });
  return best;
}

function arrangeFaces(arrangement: Arrangement): Face[] {
  const faces: Face[] = [];
  const faceOfHalfEdge = new Map<number, number>();
  const floating: number[][] = [];
  for (const cycle of traceLoops(arrangement, allHalfEdges(arrangement))) {
    const loops = boundaryLoops(arrangement, cycle).map((loop) => ({ loop, area: loopArea(arrangement, loop) }));
    if (loopArea(arrangement, cycle) <= AREA_EPS) {
      floating.push(...loops.filter((entry) => entry.area < -AREA_EPS).map((entry) => entry.loop));
      continue;
    }
    const outer = loops.reduce((best, entry) => (entry.area > best.area ? entry : best));
    const index = faces.push({ outer: outer.loop, holes: loops.filter((entry) => entry.area < -AREA_EPS).map((entry) => entry.loop), outerArea: outer.area }) - 1;
    cycle.forEach((halfEdge) => faceOfHalfEdge.set(halfEdge, index));
  }
  const outers = faces.map((face) => ({ loop: face.outer, area: face.outerArea }));
  for (const loop of floating) {
    const inner = faceOfHalfEdge.get(twin(loop[0]));
    const owner = smallestContaining(arrangement, outers, halfEdgeMiddle(arrangement, loop[0]), (index) => index === inner);
    if (owner !== null) faces[owner].holes.push(loop);
  }
  return faces;
}

function faceCurves(arrangement: Arrangement, face: { outer: number[]; holes: number[][] }): Curve[] {
  return [face.outer, ...face.holes].flatMap((loop) => loopCurves(arrangement, loop));
}

function widestSpan(curves: Curve[], from: number, to: number): { at: number; middle: number; width: number } | null {
  let best: { at: number; middle: number; width: number } | null = null;
  for (let i = 0; i < SCANLINES; i++) {
    const at = from + ((to - from) * (i + 0.5 + 0.0137 * Math.SQRT2)) / SCANLINES;
    const xs = crossingsAt(curves, at).sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const width = xs[k + 1] - xs[k];
      if (!best || width > best.width) best = { at, middle: (xs[k] + xs[k + 1]) / 2, width };
    }
  }
  return best;
}

function bounds(points: SketchPoint[]) {
  return {
    minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)),
  };
}

function representativePoint(curves: Curve[]): SketchPoint {
  const box = bounds(curves.flatMap(curvePolyline));
  const row = widestSpan(curves, box.minY, box.maxY);
  if (!row) return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const ys = crossingsAt(curves.map(swapAxes), row.middle).sort((a, b) => a - b);
  for (let k = 0; k + 1 < ys.length; k += 2) {
    if (ys[k] <= row.at && row.at <= ys[k + 1]) return { x: row.middle, y: (ys[k] + ys[k + 1]) / 2 };
  }
  return { x: row.middle, y: row.at };
}

function signature(arrangement: Arrangement, face: Face): string {
  const tokens = new Set<string>();
  for (const halfEdge of [face.outer, ...face.holes].flat()) {
    tokens.add(`${arrangement.edges[edgeOf(halfEdge)].source}${isForward(halfEdge) ? "+" : "-"}`);
  }
  return [...tokens].sort().join(",");
}

function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(36).padStart(7, "0");
}

function regionKeys(signatures: string[], points: SketchPoint[]): string[] {
  const keys = signatures.map((text) => `r${hash(text)}`);
  const groups = new Map<string, number[]>();
  keys.forEach((key, index) => groups.set(key, [...(groups.get(key) ?? []), index]));
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    members
      .sort((a, b) => points[a].y - points[b].y || points[a].x - points[b].x)
      .forEach((index, order) => { keys[index] = order === 0 ? key : `${key}~${order + 1}`; });
  }
  return keys;
}

function loopContour(arrangement: Arrangement, loop: number[]): BrowserContour {
  const point = (index: number) => arrangement.vertices[index];
  const start = point(halfEdgeFrom(arrangement, loop[0]));
  const segments = loop.map((halfEdge, i): BrowserSegment => {
    const from = point(halfEdgeFrom(arrangement, halfEdge));
    const end = i === loop.length - 1 ? start : point(halfEdgeTo(arrangement, halfEdge));
    const curve = arrangement.edges[edgeOf(halfEdge)].curve;
    if (curve.kind === "line") return { kind: "line", start: from, end };
    return { kind: "arc", start: from, via: curvePoint(curve, 0.5), end };
  });
  return { start, segments };
}

function loopPolygon(arrangement: Arrangement, loop: number[]): SketchPoint[] {
  return loop.flatMap((halfEdge) => {
    const points = curvePolyline(arrangement.edges[edgeOf(halfEdge)].curve);
    return (isForward(halfEdge) ? points : points.reverse()).slice(1);
  });
}

export function sketchRegionLayout(entities: SketchEntity[]): RegionLayout {
  const arrangement = buildArrangement(entities);
  const faces = arrangeFaces(arrangement);
  const points = faces.map((face) => representativePoint(faceCurves(arrangement, face)));
  const keys = regionKeys(faces.map((face) => signature(arrangement, face)), points);
  const regions = faces.map((face, index) => ({
    key: keys[index],
    area: face.outerArea + face.holes.reduce((sum, hole) => sum + loopArea(arrangement, hole), 0),
    point: points[index],
    outer: loopContour(arrangement, face.outer),
    holes: face.holes.map((hole) => loopContour(arrangement, hole)),
  }));
  return { arrangement, faces, regions };
}

export function sketchRegions(entities: SketchEntity[]): SketchRegion[] {
  return sketchRegionLayout(entities).regions;
}

export function regionPolygon(layout: RegionLayout, index: number): RegionPolygon {
  const face = layout.faces[index];
  return {
    outer: loopPolygon(layout.arrangement, face.outer),
    holes: face.holes.map((hole) => loopPolygon(layout.arrangement, hole)),
  };
}

export function regionIndexAt(layout: RegionLayout, point: SketchPoint): number | null {
  const index = layout.faces.findIndex((face) => insideCurves(faceCurves(layout.arrangement, face), point));
  return index < 0 ? null : index;
}

export interface MergedProfile {
  regions: BrowserRegion[];
  polygons: RegionPolygon[];
  probes: { key: string; point: SketchPoint }[];
}

function missingKeysError(missing: string[]): Error {
  return new Error(`В эскизе нет региона ${missing.join(", ")}: эскиз изменился так, что область профиля пропала. Выберите профиль заново.`);
}

export function mergeRegions(layout: RegionLayout, keys: string[]): MergedProfile {
  const wanted = new Set(keys);
  const missing = keys.filter((key) => !layout.regions.some((region) => region.key === key));
  if (missing.length > 0) throw missingKeysError(missing);
  const { arrangement } = layout;
  const halfEdges = layout.faces
    .filter((_, index) => wanted.has(layout.regions[index].key))
    .flatMap((face) => [face.outer, ...face.holes].flat());
  const loops = boundaryLoops(arrangement, halfEdges).map((loop) => ({ loop, area: loopArea(arrangement, loop) }));
  const outers = loops.filter((entry) => entry.area > AREA_EPS);
  const holes = outers.map(() => [] as number[][]);
  for (const { loop, area } of loops) {
    if (area >= -AREA_EPS) continue;
    const owner = smallestContaining(arrangement, outers, halfEdgeMiddle(arrangement, loop[0]), () => false);
    if (owner !== null) holes[owner].push(loop);
  }
  const probes = new Map<string, SketchPoint>();
  for (const halfEdge of loops.flatMap((entry) => entry.loop)) {
    const edge = arrangement.edges[edgeOf(halfEdge)];
    if (!probes.has(edge.probeKey)) probes.set(edge.probeKey, curvePoint(edge.curve, 0.5));
  }
  return {
    regions: outers.map((outer, index) => ({ outer: loopContour(arrangement, outer.loop), holes: holes[index].map((hole) => loopContour(arrangement, hole)) })),
    polygons: outers.map((outer, index) => ({ outer: loopPolygon(arrangement, outer.loop), holes: holes[index].map((hole) => loopPolygon(arrangement, hole)) })),
    probes: [...probes].map(([key, point]) => ({ key, point })),
  };
}

export function mergedProfileOf(entities: SketchEntity[], keys: string[]): MergedProfile {
  const merged = mergeRegions(sketchRegionLayout(entities), keys);
  if (merged.regions.length === 0) throw new Error("Выбранные регионы не дают замкнутого профиля.");
  return merged;
}

function insidePolygon(point: SketchPoint, polygon: SketchPoint[]): boolean {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a.y > point.y !== b.y > point.y && point.x < a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside;
  }
  return inside;
}

export function polygonIndexAt(polygons: RegionPolygon[], point: SketchPoint): number | null {
  const index = polygons.findIndex((polygon) => insidePolygon(point, polygon.outer) && !polygon.holes.some((hole) => insidePolygon(point, hole)));
  return index < 0 ? null : index;
}
