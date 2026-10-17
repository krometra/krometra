// Arc tool: click for center, drag for radius + two clicks for angle range

import type { SketchEntity, SketchArc, SketchPoint } from "@/types/api";
import type { SketchTool, SketchToolContext } from "./SketchTool";

type ArcStage = "center" | "radius" | "startAngle" | "endAngle";

export class ArcTool implements SketchTool {
  private center: SketchPoint | null = null;
  private radius: number | null = null;
  private startAngle: number | null = null;
  private endAngle: number | null = null;
  private currentId: string | null = null;
  private stage: ArcStage = "center";
  private currentPoint: SketchPoint | null = null;

  onMouseDown(sx: number, sy: number, ctx: SketchToolContext): void {
    const world = ctx.screenToWorld(sx, sy);

    switch (this.stage) {
      case "center":
        this.center = world;
        this.currentId = ctx.nextId();
        this.stage = "radius";
        this.currentPoint = world;
        break;
      case "radius":
        // Radius is already set by drag, move to angle stage
        this.stage = "startAngle";
        this.startAngle = this.computeAngle(world);
        this.currentPoint = world;
        break;
      case "startAngle":
        this.endAngle = this.computeAngle(world);
        // Arc is finalized
        break;
      case "endAngle":
        // Should not get here
        break;
    }
  }

  onMouseMove(sx: number, sy: number, ctx: SketchToolContext): void {
    const world = ctx.screenToWorld(sx, sy);
    this.currentPoint = world;

    if (this.stage === "radius" && this.center) {
      const dx = world.x - this.center.x;
      const dy = world.y - this.center.y;
      this.radius = Math.sqrt(dx * dx + dy * dy);
    }

    if (this.stage === "startAngle" && this.center) {
      // Preview: start angle → current mouse position
      this.endAngle = this.computeAngle(world);
    }
  }

  onMouseUp(_sx: number, _sy: number, ctx: SketchToolContext): SketchEntity | null {
    if (
      this.center &&
      this.radius !== null &&
      this.radius > ctx.pixelsToWorld(4) &&
      this.startAngle !== null &&
      this.endAngle !== null &&
      this.currentId
    ) {
      // Check we're past the radius stage and have all angles
      if (this.stage === "endAngle" || (this.stage === "startAngle" && this.startAngle !== this.endAngle)) {
        const arc: SketchArc = {
          id: this.currentId,
          type: "arc",
          center: { ...this.center },
          radius: this.radius,
          startAngle: this.startAngle,
          endAngle: this.endAngle ?? this.startAngle + Math.PI,
        };
        this.reset();
        return arc;
      }
    }
    return null;
  }

  getPreview(): SketchEntity | null {
    if (this.center && this.radius !== null && this.radius > 0 && this.currentId) {
      const sa = this.startAngle ?? 0;
      const ea = this.endAngle ?? (sa + Math.PI * 0.5);
      return {
        id: this.currentId,
        type: "arc",
        center: { ...this.center },
        radius: this.radius,
        startAngle: sa,
        endAngle: ea,
      } as SketchArc;
    }
    return null;
  }

  reset(): void {
    this.center = null;
    this.radius = null;
    this.startAngle = null;
    this.endAngle = null;
    this.currentId = null;
    this.stage = "center";
    this.currentPoint = null;
  }

  isActive(): boolean {
    return this.stage !== "center" || this.center !== null;
  }

  private computeAngle(point: SketchPoint): number {
    if (!this.center) return 0;
    return Math.atan2(point.y - this.center.y, point.x - this.center.x);
  }
}
