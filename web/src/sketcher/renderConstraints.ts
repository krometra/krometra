import type { SketchConstraint, SketchEntity } from "@/types/api";
import { constraintGlyphs, glyphHalfSize, type ConstraintGlyph } from "./constraintGlyphs";
import { dimensionLayouts } from "./dimensionLayout";
import { drawDimensions } from "./renderDimensions";
import type { ViewParams } from "./renderEntities";

const COLOR = "oklch(0.78 0.13 75 / 0.7)";
const HOVER_COLOR = "oklch(0.7 0.16 250 / 0.9)";
const SELECTED_COLOR = "oklch(0.6 0.2 250)";
const TEXT_COLOR = "#fff";

export interface ConstraintFocus {
  hovered: string | null;
  selected: string | null;
}

function glyphColor(glyph: ConstraintGlyph, focus: ConstraintFocus): string {
  if (glyph.constraintId === focus.selected) return SELECTED_COLOR;
  return glyph.constraintId === focus.hovered ? HOVER_COLOR : COLOR;
}

function drawGlyph(ctx: CanvasRenderingContext2D, glyph: ConstraintGlyph, unit: number, color: string) {
  const half = glyphHalfSize(glyph, unit) * (glyph.shape === "dot" ? 0.5 : 0.85);
  ctx.fillStyle = color;
  ctx.fillRect(glyph.at.x - half, glyph.at.y - half, half * 2, half * 2);
  if (!glyph.text) return;
  ctx.save();
  ctx.translate(glyph.at.x, glyph.at.y);
  ctx.scale(1, -1);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(glyph.text, 0, 0);
  ctx.restore();
}

export function drawConstraints(
  ctx: CanvasRenderingContext2D,
  view: ViewParams,
  constraints: SketchConstraint[],
  entityList: SketchEntity[],
  focus: ConstraintFocus = { hovered: null, selected: null },
) {
  if (constraints.length === 0) return;
  const unit = 1 / view.zoom;

  ctx.save();
  ctx.font = `${10 * unit}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const glyph of constraintGlyphs(constraints, entityList, unit)) {
    drawGlyph(ctx, glyph, unit, glyphColor(glyph, focus));
  }
  ctx.restore();

  drawDimensions(ctx, dimensionLayouts(constraints, entityList, unit), view.zoom);
}
