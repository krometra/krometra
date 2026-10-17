import type { DimensionLayout } from "./dimensionLayout";
import { ARROW_HALF_WIDTH_PX, ARROW_PX, type DimensionArrow } from "./dimensionMarks";

const LINE_COLOR = "rgba(196, 128, 18, 0.9)";
const TEXT_COLOR = "rgba(120, 72, 0, 1)";
const TEXT_HALO = "rgba(255, 255, 255, 0.9)";

function drawLines(ctx: CanvasRenderingContext2D, layout: DimensionLayout) {
  ctx.beginPath();
  for (const [a, b] of layout.lines) {
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

function drawArrow(ctx: CanvasRenderingContext2D, arrow: DimensionArrow, zoom: number) {
  const { tip, dir } = arrow;
  const length = ARROW_PX / zoom;
  const half = ARROW_HALF_WIDTH_PX / zoom;
  const base = { x: tip.x - dir.x * length, y: tip.y - dir.y * length };
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(base.x - dir.y * half, base.y + dir.x * half);
  ctx.lineTo(base.x + dir.y * half, base.y - dir.x * half);
  ctx.closePath();
}

function drawLabel(ctx: CanvasRenderingContext2D, layout: DimensionLayout, zoom: number) {
  ctx.save();
  ctx.translate(layout.label.x, layout.label.y);
  ctx.scale(1 / zoom, -1 / zoom);
  ctx.font = "12px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = TEXT_HALO;
  ctx.strokeText(layout.text, 0, 1);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(layout.text, 0, 1);
  ctx.restore();
}

export function drawDimensions(ctx: CanvasRenderingContext2D, layouts: DimensionLayout[], zoom: number) {
  if (layouts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = LINE_COLOR;
  ctx.fillStyle = LINE_COLOR;
  ctx.lineWidth = 1 / zoom;
  for (const layout of layouts) drawLines(ctx, layout);
  ctx.beginPath();
  for (const layout of layouts) for (const arrow of layout.arrows) drawArrow(ctx, arrow, zoom);
  ctx.fill();
  for (const layout of layouts) drawLabel(ctx, layout, zoom);
  ctx.restore();
}
