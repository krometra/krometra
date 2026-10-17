import { browserPlaneFrame, type Vector3 } from "./browserExtrudeFrame";
import { alignedFacePlane } from "./browserFacePlane";
import { isStableFaceName } from "./browserNaming";
import type { PlaneBasis, SketchPlane, TimelineEntry } from "@/types/api";

export interface SketchSeatPlacement {
  plane: SketchPlane;
  planeOffset: number;
  planeBasis: PlaneBasis | null;
}

export interface SketchFaceRef {
  bodyId: string;
  faceName: string;
}

export interface SketchSeatStep extends SketchFaceRef {
  kind: "sketch_plane";
  entryId: string;
  sketchId: string;
  label: string;
  placement: SketchSeatPlacement;
}

export type SeatSurface = { planar: true; point: Vector3; normal: Vector3 } | { planar: false };

interface SeatDocument {
  components: Record<string, unknown>;
  timeline: TimelineEntry[];
}

const SAME_PLANE_TOLERANCE = 1e-7;
const DEGENERATE = 1e-9;
const NOISE = 1e-12;
const SKETCH_FEATURES = new Set(["extrude", "revolve", "sweep"]);

function sketchOf(document: SeatDocument, sketchId: string | null | undefined): Record<string, unknown> | null {
  const sketch = sketchId ? document.components[sketchId] : null;
  if (!sketch || typeof sketch !== "object" || !Array.isArray((sketch as { entities?: unknown }).entities)) return null;
  return sketch as Record<string, unknown>;
}

export function sketchFaceRef(sketch: Record<string, unknown> | null): SketchFaceRef | null {
  const bodyId = sketch?.ref_body_id;
  const faceName = sketch?.ref_face_id;
  if (typeof bodyId !== "string" || bodyId.length === 0 || !isStableFaceName(faceName)) return null;
  return { bodyId, faceName };
}

function workPlaneOwner(document: SeatDocument, sketch: Record<string, unknown> | null): string | null {
  const planeId = sketch?.ref_plane_id;
  const plane = typeof planeId === "string" ? (document.components[planeId] as Record<string, unknown> | undefined) : undefined;
  return plane?.type === "work_plane" && typeof plane.ref_body_id === "string" ? plane.ref_body_id : null;
}

export function sketchOwnerBody(document: SeatDocument, entry: TimelineEntry): string | null {
  if (!SKETCH_FEATURES.has(entry.kind)) return null;
  const sketch = sketchOf(document, entry.sketch_id);
  return sketchFaceRef(sketch)?.bodyId ?? workPlaneOwner(document, sketch);
}

function placementOf(sketch: Record<string, unknown>): SketchSeatPlacement {
  return {
    plane: (typeof sketch.plane === "string" ? sketch.plane : "XY") as SketchPlane,
    planeOffset: typeof sketch.plane_offset === "number" && Number.isFinite(sketch.plane_offset) ? sketch.plane_offset : 0,
    planeBasis: (sketch.plane_basis as PlaneBasis | null | undefined) ?? null,
  };
}

export function sketchSeatSteps(document: SeatDocument, bodyId: string): SketchSeatStep[] {
  return Object.keys(document.components).flatMap((sketchId) => {
    const sketch = sketchOf(document, sketchId);
    const ref = sketchFaceRef(sketch);
    if (!sketch || !ref || ref.bodyId !== bodyId) return [];
    const entry = document.timeline.find((candidate) => candidate.kind === "sketch" && candidate.sketch_id === sketchId);
    return [{
      kind: "sketch_plane" as const,
      entryId: entry?.id ?? sketchId,
      sketchId,
      label: entry?.label ?? "Эскиз",
      ...ref,
      placement: placementOf(sketch),
    }];
  });
}

export function seatFaceIndex(faceNames: string[], seat: Pick<SketchSeatStep, "faceName" | "label">): number {
  const index = faceNames.indexOf(seat.faceName);
  if (index < 0) {
    throw new Error(`«${seat.label}»: грань, на которой построен эскиз, исчезла при пересборке тела. Верните прежние параметры или пересоздайте эскиз на нужной грани.`);
  }
  return index;
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function along(origin: Vector3, direction: Vector3, distance: number): Vector3 {
  return [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance];
}

function withoutNoise(vector: Vector3): Vector3 {
  return vector.map((value) => (Math.abs(value) < NOISE ? 0 : value)) as Vector3;
}

function unit(vector: Vector3): Vector3 | null {
  const length = Math.hypot(...vector);
  if (!(length > DEGENERATE)) return null;
  return withoutNoise([vector[0] / length, vector[1] / length, vector[2] / length]);
}

function scaled(vector: Vector3, factor: number): Vector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function inPlane(vector: Vector3, normal: Vector3): Vector3 | null {
  return unit(along(vector, normal, -dot(vector, normal)));
}

function sameVector(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= SAME_PLANE_TOLERANCE);
}

function sameBasis(a: PlaneBasis, b: PlaneBasis): boolean {
  return sameVector(a.origin, b.origin) && sameVector(a.u, b.u) && sameVector(a.v, b.v) && sameVector(a.n, b.n);
}

export function reseatSketchPlane(previous: SketchSeatPlacement, surface: SeatSurface, label: string): SketchSeatPlacement {
  const normal = surface.planar ? unit(surface.normal) : null;
  if (!surface.planar || !normal) {
    throw new Error(`«${label}»: грань, на которой построен эскиз, после пересборки тела перестала быть плоской. Верните прежние параметры или пересоздайте эскиз на плоской грани.`);
  }
  const frame = browserPlaneFrame({ ...previous, center: { x: 0, y: 0 } });
  const handedness = dot(cross(frame.u, frame.v), frame.n) < 0 ? -1 : 1;
  const keptV = inPlane(frame.v, normal);
  const u = inPlane(frame.u, normal) ?? (keptV && unit(scaled(cross(keptV, normal), handedness)));
  if (!u) throw new Error(`«${label}»: не удалось сориентировать эскиз на пересобранной грани.`);
  const lift = dot([
    surface.point[0] - frame.origin[0],
    surface.point[1] - frame.origin[1],
    surface.point[2] - frame.origin[2],
  ], normal);
  const basis: PlaneBasis = {
    origin: withoutNoise(along(frame.origin, normal, lift)),
    u,
    v: withoutNoise(scaled(cross(normal, u), handedness)),
    n: normal,
  };
  if (previous.planeBasis && sameBasis(previous.planeBasis, basis)) return previous;
  const aligned = alignedFacePlane(basis.origin as Vector3, normal);
  return { plane: aligned?.plane ?? "XY", planeOffset: aligned?.planeOffset ?? 0, planeBasis: basis };
}
