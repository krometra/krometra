import type { SketchPoint } from "@/types/api";
import type { ViewParams } from "./renderEntities";

const OFFSET_PX = { x: 14, y: 10 };
const BADGE_PX = 16;
const GAP_PX = 3;

export function drawAutoConstraintHint(
  ctx: CanvasRenderingContext2D,
  view: ViewParams,
  at: SketchPoint,
  symbols: string[],
) {
  if (symbols.length === 0) return;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.scale(1 / view.zoom, -1 / view.zoom);
  ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  symbols.forEach((symbol, index) => {
    const left = OFFSET_PX.x + index * (BADGE_PX + GAP_PX);
    const top = OFFSET_PX.y;
    ctx.fillStyle = "rgba(20, 142, 116, 0.92)";
    ctx.fillRect(left, top, BADGE_PX, BADGE_PX);
    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.fillText(symbol, left + BADGE_PX / 2, top + BADGE_PX / 2 + 0.5);
  });
  ctx.restore();
}
