import type { SketchPoint } from "@/types/api";

export interface DimensionArrow {
  tip: SketchPoint;
  dir: SketchPoint;
}

export interface DimensionMarks {
  label: SketchPoint;
  lines: [SketchPoint, SketchPoint][];
  arrows: DimensionArrow[];
}

export const ARROW_PX = 8;
export const ARROW_HALF_WIDTH_PX = 2.5;
const EXTENSION_GAP_PX = 3;
const EXTENSION_OVERSHOOT_PX = 5;
const LABEL_GAP_PAD_PX = 3;
const OUTSIDE_TAIL_PX = 10;

const sub = (a: SketchPoint, b: SketchPoint): SketchPoint => ({ x: a.x - b.x, y: a.y - b.y });
const plus = (p: SketchPoint, d: SketchPoint, k: number): SketchPoint => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const mid = (a: SketchPoint, b: SketchPoint): SketchPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const length = (v: SketchPoint) => Math.hypot(v.x, v.y);

function unit(v: SketchPoint): SketchPoint | null {
  const l = length(v);
  return l < 1e-12 ? null : { x: v.x / l, y: v.y / l };
}

export function extensionLine(from: SketchPoint, to: SketchPoint, unitPx: number): [SketchPoint, SketchPoint] | null {
  const dir = unit(sub(to, from));
  if (!dir || length(sub(to, from)) <= EXTENSION_GAP_PX * unitPx) return null;
  return [plus(from, dir, EXTENSION_GAP_PX * unitPx), plus(to, dir, EXTENSION_OVERSHOOT_PX * unitPx)];
}

function labelGapHalf(dir: SketchPoint, half: { w: number; h: number }, unitPx: number): number {
  const along = Math.min(
    Math.abs(dir.x) > 1e-9 ? half.w / Math.abs(dir.x) : Infinity,
    Math.abs(dir.y) > 1e-9 ? half.h / Math.abs(dir.y) : Infinity,
  );
  return along + LABEL_GAP_PAD_PX * unitPx;
}

export function dimensionLine(
  from: SketchPoint,
  to: SketchPoint,
  half: { w: number; h: number },
  unitPx: number,
  arrowAtStart: boolean,
  outward: SketchPoint | null,
): DimensionMarks {
  const span = length(sub(to, from));
  const dir = unit(sub(to, from)) ?? { x: 1, y: 0 };
  const normal = { x: -dir.y, y: dir.x };
  const center = mid(from, to);
  const gap = labelGapHalf(dir, half, unitPx);
  const arrowRoom = (arrowAtStart ? 2 : 1) * ARROW_PX * unitPx;
  const textFits = span >= 2 * gap + arrowRoom;
  const arrowsInside = span >= arrowRoom + 4 * unitPx;
  const back = { x: -dir.x, y: -dir.y };

  const lines: [SketchPoint, SketchPoint][] = textFits
    ? [[from, plus(center, back, gap)], [plus(center, dir, gap), to]]
    : [[from, to]];
  if (!arrowsInside) {
    if (arrowAtStart) lines.push([from, plus(from, back, OUTSIDE_TAIL_PX * unitPx)]);
    lines.push([to, plus(to, dir, OUTSIDE_TAIL_PX * unitPx)]);
  }
  const arrows: DimensionArrow[] = arrowsInside
    ? [...(arrowAtStart ? [{ tip: from, dir: back }] : []), { tip: to, dir }]
    : [...(arrowAtStart ? [{ tip: from, dir }] : []), { tip: to, dir: back }];
  const side = outward
    ? (normal.x * outward.x + normal.y * outward.y < 0 ? -1 : 1)
    : (normal.y < -1e-9 || (Math.abs(normal.y) <= 1e-9 && normal.x < 0) ? -1 : 1);
  const label = textFits ? center : plus(center, normal, side * (half.h + LABEL_GAP_PAD_PX * unitPx + Math.abs(normal.x) * half.w));
  return { label, lines, arrows };
}

export function linearDimension(
  points: [SketchPoint, SketchPoint],
  ends: [SketchPoint, SketchPoint],
  half: { w: number; h: number },
  unitPx: number,
): DimensionMarks {
  const outward = unit(sub(ends[0], points[0])) ?? unit(sub(ends[1], points[1]));
  const marks = dimensionLine(ends[0], ends[1], half, unitPx, true, outward);
  const extensions = [extensionLine(points[0], ends[0], unitPx), extensionLine(points[1], ends[1], unitPx)].filter(
    (line): line is [SketchPoint, SketchPoint] => line !== null,
  );
  return { ...marks, lines: [...extensions, ...marks.lines] };
}

export function arcArrows(center: SketchPoint, radius: number, from: number, to: number): DimensionArrow[] {
  const sign = to >= from ? 1 : -1;
  const at = (angle: number) => plus(center, { x: Math.cos(angle), y: Math.sin(angle) }, radius);
  const tangent = (angle: number) => ({ x: -Math.sin(angle) * sign, y: Math.cos(angle) * sign });
  const start = tangent(from);
  return [
    { tip: at(from), dir: { x: -start.x, y: -start.y } },
    { tip: at(to), dir: tangent(to) },
  ];
}
