export interface MenuBox {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

const MARGIN = 8;

function clampAxis(start: number, size: number, limit: number): number {
  return Math.max(MARGIN, Math.min(start, limit - size - MARGIN));
}

export function clampMenuPosition(x: number, y: number, box: MenuBox, viewport: Viewport) {
  return { left: clampAxis(x, box.width, viewport.width), top: clampAxis(y, box.height, viewport.height) };
}
