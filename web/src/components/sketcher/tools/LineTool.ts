// Line tool: click to set start point, click again to set end point

import type { SketchEntity, SketchLine, SketchPoint, SketchConstraint } from "@/types/api";
import type { SketchTool, SketchToolContext } from "./SketchTool";

export class LineTool implements SketchTool {
  private startPoint: SketchPoint | null = null;
  private currentEnd: SketchPoint | null = null;
  private currentId: string | null = null;

  onMouseDown(sx: number, sy: number, ctx: SketchToolContext): void {
    const world = ctx.screenToWorld(sx, sy);

    if (!this.startPoint) {
      // First click: set start point
      this.startPoint = world;
      this.currentEnd = world;
      this.currentId = ctx.nextId();
    } else {
      // Second click: finalize line
      this.currentEnd = world;
    }
  }

  onMouseMove(sx: number, sy: number, ctx: SketchToolContext): void {
    if (this.startPoint) {
      this.currentEnd = ctx.screenToWorld(sx, sy);
    }
  }

  onMouseUp(_sx: number, _sy: number, ctx: SketchToolContext): SketchEntity | null {
    if (this.startPoint && this.currentEnd) {
      // Check if second click finalized the line (end != start)
      const dx = this.currentEnd.x - this.startPoint.x;
      const dy = this.currentEnd.y - this.startPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > ctx.pixelsToWorld(4)) {
        // Finalized line
        const line: SketchLine = {
          id: this.currentId!,
          type: "line",
          start: { ...this.startPoint },
          end: { ...this.currentEnd },
        };
        this.reset();
        return line;
      }
    }
    return null;
  }

  getPreview(): SketchEntity | null {
    if (this.startPoint && this.currentEnd && this.currentId) {
      return {
        id: this.currentId,
        type: "line",
        start: { ...this.startPoint },
        end: { ...this.currentEnd },
      } as SketchLine;
    }
    return null;
  }

  reset(): void {
    this.startPoint = null;
    this.currentEnd = null;
    this.currentId = null;
  }

  isActive(): boolean {
    return this.startPoint !== null;
  }

  detectConstraints(
    _ctx: SketchToolContext,
    existingEntities: SketchEntity[]
  ): SketchConstraint[] {
    if (!this.startPoint) return [];
    const constraints: SketchConstraint[] = [];
    const id = this.currentId ?? `line-${Date.now()}`;

    // Get the last line entity we just created
    const start = this.startPoint;
    const end = this.currentEnd;
    if (!start || !end) return [];

    // Check for horizontal/vertical
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    if (Math.abs(angle) < 5 || Math.abs(angle - 180) < 5 || Math.abs(angle + 180) < 5) {
      constraints.push({
        id: `constraint-h-${Date.now()}`,
        type: "horizontal",
        anchors: [{ entity_id: id, sub_index: 0 }],
        value: null,
      });
    } else if (Math.abs(Math.abs(angle) - 90) < 5) {
      constraints.push({
        id: `constraint-v-${Date.now()}`,
        type: "vertical",
        anchors: [{ entity_id: id, sub_index: 0 }],
        value: null,
      });
    }

    // Check auto-coincident with existing points
    for (const entity of existingEntities) {
      if (entity.type === "line") {
        const d1 = Math.sqrt((start.x - entity.start.x) ** 2 + (start.y - entity.start.y) ** 2);
        const d2 = Math.sqrt((start.x - entity.end.x) ** 2 + (start.y - entity.end.y) ** 2);
        const d3 = Math.sqrt((end.x - entity.start.x) ** 2 + (end.y - entity.start.y) ** 2);
        const d4 = Math.sqrt((end.x - entity.end.x) ** 2 + (end.y - entity.end.y) ** 2);
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
        if (d3 < 8) {
          constraints.push({
            id: `constraint-c-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            type: "coincident",
            anchors: [
              { entity_id: id, sub_index: 1 },
              { entity_id: entity.id, sub_index: 0 },
            ],
            value: null,
          });
        }
        if (d4 < 8) {
          constraints.push({
            id: `constraint-c-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            type: "coincident",
            anchors: [
              { entity_id: id, sub_index: 1 },
              { entity_id: entity.id, sub_index: 1 },
            ],
            value: null,
          });
        }

        // Auto-equal length
        const len1 = Math.sqrt(dx * dx + dy * dy);
        const elen = Math.sqrt(
          (entity.end.x - entity.start.x) ** 2 + (entity.end.y - entity.start.y) ** 2
        );
        if (elen > 0 && Math.abs(len1 - elen) / elen < 0.05) {
          constraints.push({
            id: `constraint-eq-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            type: "equal",
            anchors: [
              { entity_id: id, sub_index: 0 },
              { entity_id: entity.id, sub_index: 0 },
            ],
            value: null,
          });
        }
      }
      if ((entity.type === "circle" || entity.type === "arc") && entity.center) {
        const d1 = Math.sqrt((start.x - entity.center.x) ** 2 + (start.y - entity.center.y) ** 2);
        const d2 = Math.sqrt((end.x - entity.center.x) ** 2 + (end.y - entity.center.y) ** 2);
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
              { entity_id: id, sub_index: 1 },
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
