import type { SketchPoint } from "@/types/api";

export const SKETCH_ORIGIN_ID = "sketch-origin";

export const SKETCH_ORIGIN: Readonly<SketchPoint> = Object.freeze({ x: 0, y: 0 });

export function isSketchOrigin(entityId: string): boolean {
  return entityId === SKETCH_ORIGIN_ID;
}
