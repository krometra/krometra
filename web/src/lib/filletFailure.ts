const SEARCH_STEPS = 4;
const SMALLEST_RADIUS = 0.05;

export function largestWorkingRadius(radius: number, builds: (radius: number) => boolean): number | null {
  let low = 0;
  let high = radius;
  let best: number | null = null;
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const middle = (low + high) / 2;
    if (middle < SMALLEST_RADIUS) break;
    if (builds(middle)) {
      best = middle;
      low = middle;
    } else {
      high = middle;
    }
  }
  return best;
}

function formatRadius(radius: number): string {
  return String(Number(radius.toPrecision(6)));
}

export function filletFailureMessage(radius: number, edgeCount: number, fits: number | null): string {
  const where = edgeCount === 1 ? "на этом ребре" : `на выбранных рёбрах (${edgeCount})`;
  if (fits !== null) {
    return `Скругление радиусом ${formatRadius(radius)} мм ${where} не строится: соседняя геометрия не оставила места. `
      + `Здесь помещается примерно ${fits.toFixed(1)} мм.`;
  }
  return `Скругление ${where} не строится ни при каком радиусе — соседние скругления уже срезали материал вокруг. `
    + "Такие рёбра нужно скруглять одной операцией вместе с соседними, а не по очереди.";
}
