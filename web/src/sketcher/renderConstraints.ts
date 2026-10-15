import type { SketchConstraint, SketchEntity, SketchPoint } from "@/types/api";
import { dimensionLayouts } from "./dimensionLayout";
import { entityCenter, entityPoint } from "./entityGeometry";
import { drawDimensions } from "./renderDimensions";
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
    }
  }

  ctx.restore();
  drawDimensions(ctx, dimensionLayouts(constraints, entityList, 1 / view.zoom), view.zoom);
}
