const GRID_BASE_SPACING = 50;

export function niceGridSpacing(zoom: number): number {
  const spacing = GRID_BASE_SPACING / zoom;
  const magnitude = Math.pow(10, Math.floor(Math.log10(spacing)));
  const residual = spacing / magnitude;
  if (residual < 1.5) return magnitude;
  if (residual < 3.5) return 2 * magnitude;
  if (residual < 7.5) return 5 * magnitude;
  return 10 * magnitude;
}
