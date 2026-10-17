import type { SketchAxis } from "./sketchOrigin";
import type { ViewParams } from "./renderEntities";
import type { SelectionMarks } from "./selectionMarks";

const SELECTED_COLOR = "rgba(255, 200, 60, 0.85)";
const HOVER_COLOR = "rgba(25, 112, 214, 0.75)";
const POINT_RING = "rgba(38, 55, 77, 0.9)";

function strokeAxis(ctx: CanvasRenderingContext2D, view: ViewParams, axis: SketchAxis, color: string, widthPx: number) {
  const { left, top, right, bottom } = view.bounds;
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx / view.zoom;
  ctx.beginPath();
  if (axis === "x") {
    ctx.moveTo(left, 0);
    ctx.lineTo(right, 0);
  } else {
    ctx.moveTo(0, bottom);
    ctx.lineTo(0, top);
  }
  ctx.stroke();
}

export function drawSelectionMarks(ctx: CanvasRenderingContext2D, view: ViewParams, marks: SelectionMarks) {
  ctx.save();
  ctx.lineCap = "round";
  if (marks.hoveredAxis && !marks.axes.includes(marks.hoveredAxis)) strokeAxis(ctx, view, marks.hoveredAxis, HOVER_COLOR, 4);
  for (const axis of marks.axes) strokeAxis(ctx, view, axis, SELECTED_COLOR, 6);

  const r = 4.5 / view.zoom;
  for (const point of marks.points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
    ctx.fillStyle = SELECTED_COLOR;
    ctx.fill();
    ctx.strokeStyle = POINT_RING;
    ctx.lineWidth = 1.5 / view.zoom;
    ctx.stroke();
  }
  ctx.restore();
}
