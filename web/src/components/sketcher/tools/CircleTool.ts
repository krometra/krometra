// Circle tool: click for center, drag for radius

import type { SketchEntity, SketchCircle, SketchPoint, SketchConstraint } from "@/types/api";
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

  detectConstraints(
    _ctx: SketchToolContext,
    existingEntities: SketchEntity[]
  ): SketchConstraint[] {
    if (!this.center || !this.currentRadius) return [];
    const id = this.currentId ?? `circle-${Date.now()}`;
    const constraints: SketchConstraint[] = [];

    // Auto-equal radius with existing circles
    for (const entity of existingEntities) {
      if ((entity.type === "circle" || entity.type === "arc") && entity.radius) {
        if (Math.abs(this.currentRadius - entity.radius) / entity.radius < 0.05) {
          constraints.push({
            id: `constraint-eq-${Date.now()}`,
            type: "equal",
            anchors: [
              { entity_id: id, sub_index: 0 },
              { entity_id: entity.id, sub_index: 0 },
            ],
            value: null,
          });
          break;
        }
      }
    }

    // Auto-coincident center with existing points
    for (const entity of existingEntities) {
      if (entity.type === "line") {
        const d1 = Math.sqrt((this.center.x - entity.start.x) ** 2 + (this.center.y - entity.start.y) ** 2);
        const d2 = Math.sqrt((this.center.x - entity.end.x) ** 2 + (this.center.y - entity.end.y) ** 2);
        if (d1 < 8) {
          constraints.push({
            id: `constraint-c-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            type: "coincident",
            anchors: [
              { entity_id: id, sub_index: 0 },
              { entity_id: entity.id, sub_index: 0 },
            ],
            value: null,
          });
        }
        if (d2 < 8) {
          constraints.push({
            id: `constraint-c-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            type: "coincident",
            anchors: [
              { entity_id: id, sub_index: 0 },
              { entity_id: entity.id, sub_index: 1 },
            ],
            value: null,
          });
        }
      }
      if ((entity.type === "circle" || entity.type === "arc") && entity.center) {
        const d = Math.sqrt((this.center.x - entity.center.x) ** 2 + (this.center.y - entity.center.y) ** 2);
        if (d < 8) {
          constraints.push({
            id: `constraint-c-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            type: "coincident",
            anchors: [
              { entity_id: id, sub_index: 0 },
              { entity_id: entity.id, sub_index: 0 },
            ],
            value: null,
          });
        }
      }
    }

    return constraints;
  }
}
