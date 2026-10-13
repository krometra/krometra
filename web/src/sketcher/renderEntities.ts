import type { SketchEntity, SketchPoint } from "@/types/api";
import { niceGridSpacing } from "./gridSpacing";

/**
 * Отрисовка сетки, осей и сущностей эскиза на 2D-канве.
 * Модуль чистый: получает контекст и параметры вида, состояния не держит.
 */

export interface ViewParams {
  zoom: number;
  bounds: { left: number; top: number; right: number; bottom: number };
}

const CONSTRUCTION_COLOR = "20, 142, 116";
const HOVER_COLOR = "25, 112, 214";
const ENTITY_COLOR = "38, 55, 77";

export function drawGrid(ctx: CanvasRenderingContext2D, view: ViewParams) {
  const { left, top, right, bottom } = view.bounds;
  const spacing = niceGridSpacing(view.zoom);
  const startX = Math.floor(left / spacing) * spacing;
  const startY = Math.floor(bottom / spacing) * spacing;

  ctx.strokeStyle = "rgba(109, 128, 151, 0.22)";
  ctx.lineWidth = 1 / view.zoom;

  ctx.beginPath();
  for (let x = startX; x <= right; x += spacing) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = startY; y <= top; y += spacing) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
}

export function drawAxes(ctx: CanvasRenderingContext2D, view: ViewParams) {
  const { left, top, right, bottom } = view.bounds;
  ctx.lineWidth = 2 / view.zoom;

  ctx.strokeStyle = "rgba(214, 80, 80, 0.62)";
  ctx.beginPath();
  ctx.moveTo(left, 0);
  ctx.lineTo(right, 0);
  ctx.stroke();

  ctx.strokeStyle = "rgba(27, 153, 105, 0.62)";
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.lineTo(0, bottom);
  ctx.stroke();
}

function strokeColor(hovered: boolean, alpha: number): string {
  return hovered ? `rgba(${HOVER_COLOR}, ${alpha})` : `rgba(${ENTITY_COLOR}, ${alpha})`;
}

function drawInfiniteLine(
  ctx: CanvasRenderingContext2D,
  view: ViewParams,
  point: SketchPoint,
  angle: number,
  hovered: boolean,
  alpha: number
) {
  const { left, top, right, bottom } = view.bounds;
  const span = Math.max(right - left, top - bottom) * 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  ctx.strokeStyle = hovered
    ? `rgba(${HOVER_COLOR}, ${alpha})`
    : `rgba(${CONSTRUCTION_COLOR}, ${alpha * 0.9})`;
  ctx.lineWidth = (hovered ? 2.5 : 1.5) / view.zoom;
  ctx.setLineDash([12 / view.zoom, 5 / view.zoom, 3 / view.zoom, 5 / view.zoom]);
  ctx.beginPath();
  ctx.moveTo(point.x - dx * span, point.y - dy * span);
  ctx.lineTo(point.x + dx * span, point.y + dy * span);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawSelectionHalo(
  ctx: CanvasRenderingContext2D,
  view: ViewParams,
  entity: SketchEntity
) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 200, 60, 0.85)";
  ctx.lineWidth = 6 / view.zoom;
  ctx.lineCap = "round";
  ctx.beginPath();
  switch (entity.type) {
    case "line":
      ctx.moveTo(entity.start.x, entity.start.y);
      ctx.lineTo(entity.end.x, entity.end.y);
      break;
    case "rectangle":
      ctx.rect(
        Math.min(entity.corner1.x, entity.corner2.x),
        Math.min(entity.corner1.y, entity.corner2.y),
        Math.abs(entity.corner2.x - entity.corner1.x),
        Math.abs(entity.corner2.y - entity.corner1.y)
      );
      break;
    case "circle":
      ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
      break;
    case "arc":
      ctx.arc(entity.center.x, entity.center.y, entity.radius, entity.startAngle, entity.endAngle);
      break;
    case "infline":
      break;
  }
  ctx.stroke();
  ctx.restore();
}

export function drawEntity(
  ctx: CanvasRenderingContext2D,
  view: ViewParams,
  entity: SketchEntity,
  hovered: boolean,
  isPreview = false
) {
  const alpha = isPreview ? 0.5 : 1.0;
  const zoom = view.zoom;

  switch (entity.type) {
    case "infline":
      drawInfiniteLine(ctx, view, entity.point, entity.angle, hovered, alpha);
      break;

    case "line":
      if (entity.construction) {
        ctx.strokeStyle = hovered
          ? `rgba(${HOVER_COLOR}, ${alpha})`
          : `rgba(${CONSTRUCTION_COLOR}, ${alpha * 0.9})`;
        ctx.lineWidth = (hovered ? 2.5 : 1.5) / zoom;
        ctx.setLineDash([8 / zoom, 5 / zoom]);
      } else {
        ctx.strokeStyle = strokeColor(hovered, alpha);
        ctx.lineWidth = (hovered ? 3 : 2) / zoom;
      }
      ctx.beginPath();
      ctx.moveTo(entity.start.x, entity.start.y);
      ctx.lineTo(entity.end.x, entity.end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      break;

    case "rectangle": {
      const x1 = Math.min(entity.corner1.x, entity.corner2.x);
      const y1 = Math.min(entity.corner1.y, entity.corner2.y);
      const w = Math.abs(entity.corner2.x - entity.corner1.x);
      const h = Math.abs(entity.corner2.y - entity.corner1.y);

      ctx.fillStyle = isPreview ? "rgba(38, 55, 77, 0.12)" : "rgba(38, 55, 77, 0.05)";
      ctx.fillRect(x1, y1, w, h);

      ctx.strokeStyle = strokeColor(hovered, alpha);
      ctx.lineWidth = (hovered ? 3 : 2) / zoom;
      ctx.strokeRect(x1, y1, w, h);
      break;
    }

    case "circle":
      if (entity.construction) {
        ctx.strokeStyle = hovered
          ? `rgba(${HOVER_COLOR}, ${alpha})`
          : `rgba(${CONSTRUCTION_COLOR}, ${alpha * 0.9})`;
        ctx.lineWidth = (hovered ? 2.5 : 1.5) / zoom;
        ctx.setLineDash([8 / zoom, 5 / zoom]);
      } else {
        ctx.strokeStyle = strokeColor(hovered, alpha);
        ctx.lineWidth = (hovered ? 3 : 2) / zoom;
      }
      if (isPreview) {
        ctx.fillStyle = "rgba(38, 55, 77, 0.08)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;

    case "arc":
      ctx.strokeStyle = strokeColor(hovered, alpha);
      ctx.lineWidth = (hovered ? 3 : 2) / zoom;
      ctx.beginPath();
      ctx.arc(entity.center.x, entity.center.y, entity.radius, entity.startAngle, entity.endAngle);
      ctx.stroke();

      // Draw lines from center to arc endpoints for clarity
      ctx.strokeStyle = `rgba(${ENTITY_COLOR}, ${alpha * 0.3})`;
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      for (const angle of [entity.startAngle, entity.endAngle]) {
        ctx.moveTo(entity.center.x, entity.center.y);
        ctx.lineTo(
          entity.center.x + entity.radius * Math.cos(angle),
          entity.center.y + entity.radius * Math.sin(angle)
        );
      }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
  }
}

export function drawSnapMarker(
  ctx: CanvasRenderingContext2D,
  view: ViewParams,
  point: SketchPoint,
  label?: string | null
) {
  const s = 5 / view.zoom;
  ctx.strokeStyle = "rgba(255, 215, 0, 0.9)";
  ctx.lineWidth = 1.5 / view.zoom;
  ctx.beginPath();
  ctx.arc(point.x, point.y, s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(point.x - s * 1.6, point.y);
  ctx.lineTo(point.x + s * 1.6, point.y);
  ctx.moveTo(point.x, point.y - s * 1.6);
  ctx.lineTo(point.x, point.y + s * 1.6);
  ctx.stroke();

  // Тип привязки: без подписи две привязки в одной точке неразличимы.
  if (!label) return;
  ctx.save();
  // Текст рисуем в экранном масштабе: иначе на любом зуме он нечитаемый.
  ctx.translate(point.x + s * 2, point.y + s * 2);
  ctx.scale(1 / view.zoom, -1 / view.zoom);
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "bottom";
  const width = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(38, 55, 77, 0.88)";
  ctx.fillRect(-2, -13, width + 6, 15);
  ctx.fillStyle = "rgba(255, 215, 0, 0.95)";
  ctx.fillText(label, 1, 0);
  ctx.restore();
}
