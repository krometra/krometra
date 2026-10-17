export const CUBE_DRAG_SLOP_PX = 4;
export const CUBE_ORBIT_RADIANS_PER_PX = Math.PI / 180;

export interface CubeDrag {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  dragging: boolean;
}

export interface CubeOrbit {
  azimuth: number;
  elevation: number;
}

export function beginCubeDrag(x: number, y: number): CubeDrag {
  return { startX: x, startY: y, lastX: x, lastY: y, dragging: false };
}

export function moveCubeDrag(drag: CubeDrag, x: number, y: number): { drag: CubeDrag; orbit: CubeOrbit | null } {
  const dragging = drag.dragging || Math.hypot(x - drag.startX, y - drag.startY) > CUBE_DRAG_SLOP_PX;
  if (!dragging) return { drag, orbit: null };
  const orbit = {
    azimuth: (x - drag.lastX) * CUBE_ORBIT_RADIANS_PER_PX,
    elevation: (y - drag.lastY) * CUBE_ORBIT_RADIANS_PER_PX,
  };
  return { drag: { ...drag, lastX: x, lastY: y, dragging: true }, orbit };
}
