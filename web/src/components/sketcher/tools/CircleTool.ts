// Circle tool: click for center, drag for radius

import type { SketchEntity, SketchCircle, SketchPoint } from "@/types/api";
import type { SketchTool, SketchToolContext } from "./SketchTool";

export class CircleTool implements SketchTool {
  private center: SketchPoint | null = null;
  private currentRadius: number | null = null;
  private currentId: string | null = null;
  private drawing = false;
  private radiusOverride: number | null = null;

  /** Радиус, введённый вручную во всплывающем поле, побеждает перетаскивание. */
  setRadiusOverride(radius: number | null): void {
    this.radiusOverride = radius !== null && radius > 0 ? radius : null;
  }

  private effectiveRadius(): number | null {
    if (this.radiusOverride !== null) return this.radiusOverride;
    return this.currentRadius;
  }

  getRadius(): number | null {
    return this.effectiveRadius();
  }

  getCenter(): SketchPoint | null {
    return this.center;
  }

  onMouseDown(sx: number, sy: number, ctx: SketchToolContext): void {
    if (this.drawing) return;
    this.center = ctx.screenToWorld(sx, sy);
    this.currentRadius = 0;
    this.currentId = ctx.nextId();
    this.drawing = true;
  }

  onMouseMove(sx: number, sy: number, ctx: SketchToolContext): void {
    if (this.drawing && this.center) {
      const world = ctx.screenToWorld(sx, sy);
      const dx = world.x - this.center.x;
      const dy = world.y - this.center.y;
      this.currentRadius = Math.sqrt(dx * dx + dy * dy);
    }
  }

  onMouseUp(_sx: number, _sy: number, ctx: SketchToolContext): SketchEntity | null {
    if (!this.drawing) return null;
    const minRadius = ctx.pixelsToWorld(4);
    const radius = this.effectiveRadius();
    const radiusOk = this.radiusOverride !== null || (radius !== null && radius > minRadius);
    if (this.center && radius !== null && radiusOk && this.currentId) {
      const circle: SketchCircle = {
        id: this.currentId,
        type: "circle",
        center: { ...this.center },
        radius,
      };
      this.reset();
      return circle;
    }
    // Слишком мелко: остаёмся в режиме «клик — движение — клик»,
    // чтобы радиус можно было дотянуть мышью или ввести в поле.
    return null;
  }

  getPreview(): SketchEntity | null {
    const radius = this.effectiveRadius();
    if (this.center && radius !== null && radius > 0 && this.currentId) {
      return {
        id: this.currentId,
        type: "circle",
        center: { ...this.center },
        radius,
      } as SketchCircle;
    }
    return null;
  }

  reset(): void {
    this.center = null;
    this.currentRadius = null;
    this.radiusOverride = null;
    this.currentId = null;
    this.drawing = false;
  }

  isActive(): boolean {
    return this.drawing;
  }
}
