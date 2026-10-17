// Line tool: click to set start point, click again to set end point

import type { SketchEntity, SketchLine, SketchPoint } from "@/types/api";
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
}
