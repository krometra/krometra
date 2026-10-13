import type { SketchPoint } from "@/types/api";

export interface ViewTransform {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export function screenToWorld(sx: number, sy: number, view: ViewTransform): SketchPoint {
  return { x: (sx - view.offsetX) / view.zoom, y: (view.offsetY - sy) / view.zoom };
}

export function worldToScreen(wx: number, wy: number, view: ViewTransform): SketchPoint {
  return { x: wx * view.zoom + view.offsetX, y: view.offsetY - wy * view.zoom };
}

export function visibleWorldBounds(width: number, height: number, view: ViewTransform) {
  return {
    left: screenToWorld(0, 0, view).x,
    top: screenToWorld(0, 0, view).y,
    right: screenToWorld(width, height, view).x,
    bottom: screenToWorld(width, height, view).y,
  };
}
