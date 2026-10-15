import type { DimensionLayout } from "./dimensionLayout";
import { labelHalfSize } from "./dimensionLayout";

const LINE_COLOR = "rgba(196, 128, 18, 0.85)";
const PILL_COLOR = "rgba(255, 248, 230, 0.95)";
const TEXT_COLOR = "rgba(120, 72, 0, 1)";

function drawSegments(ctx: CanvasRenderingContext2D, layout: DimensionLayout) {
  ctx.beginPath();
  for (const [a, b] of layout.segments) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  if (layout.arc) {
    const { center, radius, from, to } = layout.arc;
    ctx.moveTo(center.x + radius * Math.cos(from), center.y + radius * Math.sin(from));
    ctx.arc(center.x, center.y, radius, from, to, to < from);
  }
  ctx.stroke();
}

function drawLabel(ctx: CanvasRenderingContext2D, layout: DimensionLayout, zoom: number) {
  const half = labelHalfSize(layout.text, 1);
  ctx.save();
  ctx.translate(layout.label.x, layout.label.y);
  ctx.scale(1 / zoom, -1 / zoom);
  ctx.fillStyle = PILL_COLOR;
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-half.w, -half.h, half.w * 2, half.h * 2, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(layout.text, 0, 1);
  ctx.restore();
}

export function drawDimensions(ctx: CanvasRenderingContext2D, layouts: DimensionLayout[], zoom: number) {
  if (layouts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1 / zoom;
  for (const layout of layouts) drawSegments(ctx, layout);
  for (const layout of layouts) drawLabel(ctx, layout, zoom);
  ctx.restore();
}
