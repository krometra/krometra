// Порог был долей мировой дистанции до цели орбиты — в пикселях он «плавал»
// вместе с высотой окна (~9 px на невысоком экране). Теперь он честно экранный.
export const EDGE_PICK_RADIUS_PX = 14;
// Ничью по экранной близости разрешает глубина: на кромке кармана соседние
// рёбра лежат в пределах пары пикселей друг от друга.
export const EDGE_PICK_TIE_PX = 2;

export interface ScoredHit<T> {
  hit: T;
  /** Расстояние от курсора до попадания на экране, в пикселях. */
  px: number;
  /** Расстояние вдоль луча. */
  distance: number;
}

/**
 * Победитель среди попаданий по рёбрам: сначала ближайшее к курсору на экране,
 * ничью в пределах EDGE_PICK_TIE_PX разрешает глубина. Порядок вдоль луча сам
 * по себе решала погрешность float, и клик регулярно брал не то ребро.
 */
export function bestEdgeHit<T>(scored: ScoredHit<T>[]): ScoredHit<T> | null {
  if (scored.length === 0) return null;
  const nearestPx = Math.min(...scored.map((s) => s.px));
  return scored
    .filter((s) => s.px <= nearestPx + EDGE_PICK_TIE_PX)
    .reduce((a, b) => (a.distance <= b.distance ? a : b));
}

/** Размер пикселя в единицах мира на дистанции камеры — порог для raycaster'а линий. */
export function worldPerPixel(fovDeg: number, distance: number, viewHeightPx: number): number {
  return (2 * Math.tan((fovDeg * Math.PI) / 360) * distance) / Math.max(viewHeightPx, 1);
}

export function edgePickThreshold(fovDeg: number, distance: number, viewHeightPx: number): number {
  return Math.max(0.05, worldPerPixel(fovDeg, distance, viewHeightPx) * EDGE_PICK_RADIUS_PX);
}
