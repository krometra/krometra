import type { SketchPoint } from "@/types/api";

export const SKETCH_ORIGIN_ID = "sketch-origin";

export const SKETCH_ORIGIN: Readonly<SketchPoint> = Object.freeze({ x: 0, y: 0 });

export type SketchAxis = "x" | "y";

export const SKETCH_AXIS_IDS: Readonly<Record<SketchAxis, string>> = Object.freeze({ x: "sketch-axis-x", y: "sketch-axis-y" });

export const FACE_EDGE_ID_PREFIX = "face-edge-";

export function isSketchOrigin(entityId: string): boolean {
  return entityId === SKETCH_ORIGIN_ID;
}

export function sketchAxisOf(entityId: string): SketchAxis | null {
  if (entityId === SKETCH_AXIS_IDS.x) return "x";
  if (entityId === SKETCH_AXIS_IDS.y) return "y";
  return null;
}

export function axisDirection(axis: SketchAxis): SketchPoint {
  return axis === "x" ? { x: 1, y: 0 } : { x: 0, y: 1 };
}

export function isFaceEdge(entityId: string): boolean {
  return entityId.startsWith(FACE_EDGE_ID_PREFIX);
}

export function isFixedReference(entityId: string): boolean {
  return isSketchOrigin(entityId) || sketchAxisOf(entityId) !== null || isFaceEdge(entityId);
}
