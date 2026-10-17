export interface ChartSeries {
  key: string;
  label: string;
  values: number[];
}

export interface ChartPoint {
  x: number;
  y: number;
  value: number;
}

export interface ChartLine {
  key: string;
  label: string;
  path: string;
  points: ChartPoint[];
}

export interface ChartTick {
  value: number;
  y: number;
}

export interface ChartLabel {
  x: number;
  text: string;
}

export interface ChartColumn {
  x: number;
  width: number;
  title: string;
}

export interface ChartBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ChartGeometry {
  box: ChartBox;
  ticks: ChartTick[];
  lines: ChartLine[];
  labels: ChartLabel[];
  columns: ChartColumn[];
}

export interface ChartInput {
  days: string[];
  series: ChartSeries[];
  width: number;
  height: number;
  formatDay: (day: string) => string;
}

export const CHART_PADDING = { top: 12, right: 16, bottom: 28, left: 40 };
const TARGET_TICKS = 4;
const MAX_LABELS = 7;
const NICE_STEPS = [1, 2, 5, 10];

export function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factor = NICE_STEPS.find((step) => step * magnitude >= raw) ?? 10;
  return factor * magnitude;
}

export function yScale(maxValue: number): { max: number; step: number } {
  const step = niceStep(maxValue / TARGET_TICKS);
  return { step, max: Math.max(step, Math.ceil(maxValue / step) * step) };
}

export function labelIndices(count: number, maxLabels = MAX_LABELS): number[] {
  const every = Math.max(1, Math.ceil(count / maxLabels));
  return Array.from({ length: count }, (_, i) => i).filter((i) => i % every === 0);
}

function xAt(box: ChartBox, index: number, count: number): number {
  const width = box.right - box.left;
  return count <= 1 ? box.left + width / 2 : box.left + (index * width) / (count - 1);
}

function columnTitle(day: string, series: ChartSeries[], index: number, formatDay: (day: string) => string): string {
  return [formatDay(day), ...series.map((s) => `${s.label}: ${s.values[index] ?? 0}`)].join("\n");
}

export function buildChart({ days, series, width, height, formatDay }: ChartInput): ChartGeometry {
  const box: ChartBox = {
    left: CHART_PADDING.left,
    top: CHART_PADDING.top,
    right: width - CHART_PADDING.right,
    bottom: height - CHART_PADDING.bottom,
  };
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values));
  const { max, step } = yScale(dataMax);
  const yAt = (value: number) => box.bottom - (value / max) * (box.bottom - box.top);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => ({ value: i * step, y: yAt(i * step) }));
  const lines = series.map((s) => {
    const points = days.map((_, i) => ({ x: xAt(box, i, days.length), y: yAt(s.values[i] ?? 0), value: s.values[i] ?? 0 }));
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    return { key: s.key, label: s.label, path, points };
  });
  const columnWidth = (box.right - box.left) / Math.max(days.length - 1, 1);
  const columns = days.map((day, i) => ({
    x: xAt(box, i, days.length) - columnWidth / 2,
    width: columnWidth,
    title: columnTitle(day, series, i, formatDay),
  }));
  const labels = labelIndices(days.length).map((i) => ({ x: xAt(box, i, days.length), text: formatDay(days[i]) }));
  return { box, ticks, lines, labels, columns };
}
