import type { SketchConstraint, SketchEntity, SketchPoint } from "@/types/api";
import { entityAngle, entityCenter, entityPoint } from "./entityGeometry";
import type { ViewParams } from "./renderEntities";

/**
 * Значки ограничений поверх эскиза. Модуль чистый: рисует по переданным
 * сущностям и параметрам вида.
 */

const COLOR = "oklch(0.78 0.13 75 / 0.7)";
const TEXT_COLOR = "#fff";

interface Ctx {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  entities: Map<string, SketchEntity>;
}

function anchorEntity(c: Ctx, constraint: SketchConstraint, index: number): SketchEntity | null {
  return c.entities.get(constraint.anchors[index]?.entity_id ?? "") ?? null;
}

function anchorPoint(c: Ctx, constraint: SketchConstraint, index: number): SketchPoint | null {
  const entity = anchorEntity(c, constraint, index);
  if (!entity) return null;
  return entityPoint(entity, constraint.anchors[index]?.sub_index ?? 0);
}

function label(c: Ctx, text: string, x: number, y: number) {
  c.ctx.save();
  c.ctx.translate(x, y);
  c.ctx.scale(1, -1);
  c.ctx.fillStyle = TEXT_COLOR;
  c.ctx.fillText(text, 0, 0);
  c.ctx.restore();
}

function badge(c: Ctx, entity: SketchEntity | null, text: string) {
  const center = entity ? entityCenter(entity) : null;
  if (!center) return;
  const s = 6 / c.zoom;
  c.ctx.strokeRect(center.x - s, center.y - s, s * 2, s * 2);
  label(c, text, center.x, center.y);
}

function midpointGlyph(c: Ctx, constraint: SketchConstraint, glyph: string) {
  const e1 = anchorEntity(c, constraint, 0);
  const e2 = anchorEntity(c, constraint, 1);
  const c1 = e1 ? entityCenter(e1) : null;
  const c2 = e2 ? entityCenter(e2) : null;
  if (!c1 || !c2) return;
  label(c, glyph, (c1.x + c2.x) / 2, (c1.y + c2.y) / 2);
}

function drawCoincident(c: Ctx, constraint: SketchConstraint) {
  const pt = anchorPoint(c, constraint, 0);
  if (!pt) return;
  const s = 3 / c.zoom;
  c.ctx.fillRect(pt.x - s, pt.y - s, s * 2, s * 2);
}

function drawDistance(c: Ctx, constraint: SketchConstraint) {
  const pt1 = anchorPoint(c, constraint, 0);
  const pt2 = anchorPoint(c, constraint, 1);
  if (!pt1 || !pt2) return;

  c.ctx.setLineDash([4 / c.zoom, 2 / c.zoom]);
  c.ctx.beginPath();
  c.ctx.moveTo(pt1.x, pt1.y);
  c.ctx.lineTo(pt2.x, pt2.y);
  c.ctx.stroke();
  c.ctx.setLineDash([]);

  const val = constraint.value !== null ? constraint.value.toFixed(1) : "?";
  label(c, `↔${val}`, (pt1.x + pt2.x) / 2, (pt1.y + pt2.y) / 2 + 8 / c.zoom);
}

function drawRadius(c: Ctx, constraint: SketchConstraint) {
  const e = anchorEntity(c, constraint, 0);
  if (!e || (e.type !== "circle" && e.type !== "arc")) return;
  if (!e.center || !e.radius) return;

  c.ctx.setLineDash([3 / c.zoom, 2 / c.zoom]);
  c.ctx.beginPath();
  c.ctx.moveTo(e.center.x, e.center.y);
  c.ctx.lineTo(e.center.x + e.radius, e.center.y);
  c.ctx.stroke();
  c.ctx.setLineDash([]);

  const val =
    constraint.value !== null ? `R${constraint.value.toFixed(1)}` : `R${e.radius.toFixed(1)}`;
  label(c, val, e.center.x + e.radius / 2, e.center.y + 8 / c.zoom);
}

function drawAngle(c: Ctx, constraint: SketchConstraint) {
  const e1 = anchorEntity(c, constraint, 0);
  const e2 = anchorEntity(c, constraint, 1);
  if (!e1 || !e2) return;
  const c1 = entityCenter(e1);
  if (!c1) return;

  const r = 20 / c.zoom;
  c.ctx.beginPath();
  c.ctx.arc(c1.x, c1.y, r, entityAngle(e1), entityAngle(e2));
  c.ctx.stroke();

  const val = constraint.value !== null ? `${constraint.value.toFixed(1)}°` : "?";
  label(c, `∠${val}`, c1.x + r * 1.2, c1.y + 8 / c.zoom);
}

export function drawConstraints(
  ctx: CanvasRenderingContext2D,
  view: ViewParams,
  constraints: SketchConstraint[],
  entityList: SketchEntity[]
) {
  if (constraints.length === 0) return;

  const c: Ctx = {
    ctx,
    zoom: view.zoom,
    entities: new Map(entityList.map((e) => [e.id, e])),
  };

  ctx.save();
  ctx.font = `${Math.max(8, 10 / view.zoom)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const constraint of constraints) {
    ctx.strokeStyle = COLOR;
    ctx.fillStyle = COLOR;
    ctx.lineWidth = 1.5 / view.zoom;

    switch (constraint.type) {
      case "horizontal":
        badge(c, anchorEntity(c, constraint, 0), "H");
        break;
      case "vertical":
        badge(c, anchorEntity(c, constraint, 0), "V");
        break;
      case "coincident":
        drawCoincident(c, constraint);
        break;
      case "parallel":
        midpointGlyph(c, constraint, "∥");
        break;
      case "perpendicular":
        midpointGlyph(c, constraint, "⊥");
        break;
      case "equal":
        midpointGlyph(c, constraint, "=");
        break;
      case "distance":
        drawDistance(c, constraint);
        break;
      case "radius":
        drawRadius(c, constraint);
        break;
      case "angle":
        drawAngle(c, constraint);
        break;
    }
  }

  ctx.restore();
}
