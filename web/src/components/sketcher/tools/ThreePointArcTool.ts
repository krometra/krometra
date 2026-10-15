import type { SketchArc, SketchConstraint, SketchEntity, SketchLine, SketchPoint } from "@/types/api";
import { arcEndpoints, areCollinear, threePointArc } from "@/sketcher/arcGeometry";
import { isConstruction } from "@/sketcher/geometry";
import type { SketchTool, SketchToolContext } from "./SketchTool";

type Stage = "start" | "end" | "via";

const STAGE_HINTS: Record<Stage, string> = {
  start: "Дуга по 3 точкам: укажите начало",
  end: "Укажите конец дуги",
  via: "Укажите точку на дуге",
};

export const COLLINEAR_ARC_HINT = "Точки на одной прямой: дугу не построить";

const MIN_CHORD_PX = 4;
const JOIN_PX = 4;

function endpointsOf(entity: SketchEntity): { point: SketchPoint; subIndex: number }[] {
  if (entity.type === "line") return [{ point: entity.start, subIndex: 0 }, { point: entity.end, subIndex: 1 }];
  if (entity.type !== "arc") return [];
  const [first, last] = arcEndpoints(entity);
  return [{ point: first, subIndex: 1 }, { point: last, subIndex: 2 }];
}

export class ThreePointArcTool implements SketchTool {
  private stage: Stage = "start";
  private start: SketchPoint | null = null;
  private end: SketchPoint | null = null;
  private cursor: SketchPoint | null = null;
  private currentId: string | null = null;
  private lastArc: SketchArc | null = null;

  onMouseDown(sx: number, sy: number, ctx: SketchToolContext): void {
    const world = ctx.screenToWorld(sx, sy);
    this.cursor = world;
    if (this.stage !== "start") return;
    this.start = world;
    this.currentId = ctx.nextId();
    this.stage = "end";
  }

  onMouseMove(sx: number, sy: number, ctx: SketchToolContext): void {
    if (this.stage !== "start") this.cursor = ctx.screenToWorld(sx, sy);
  }

  onMouseUp(_sx: number, _sy: number, ctx: SketchToolContext): SketchEntity | null {
    if (this.stage === "end") {
      this.acceptEnd(ctx);
      return null;
    }
    if (this.stage !== "via") return null;
    const arc = this.arcThroughCursor();
    if (!arc) return null;
    this.reset();
    this.lastArc = arc;
    return arc;
  }

  getPreview(): SketchEntity | null {
    if (!this.start || !this.cursor || !this.currentId) return null;
    if (this.stage === "end") return this.chord(this.start, this.cursor);
    return this.arcThroughCursor() ?? this.chord(this.start, this.end ?? this.cursor);
  }

  hint(): string {
    if (this.stage === "via" && this.start && this.end && this.cursor && areCollinear(this.start, this.end, this.cursor)) {
      return COLLINEAR_ARC_HINT;
    }
    return STAGE_HINTS[this.stage];
  }

  reset(): void {
    this.stage = "start";
    this.start = null;
    this.end = null;
    this.cursor = null;
    this.currentId = null;
    this.lastArc = null;
  }

  isActive(): boolean {
    return this.stage !== "start";
  }

  detectConstraints(ctx: SketchToolContext, existingEntities: SketchEntity[]): SketchConstraint[] {
    const arc = this.lastArc;
    if (!arc) return [];
    const tolerance = ctx.pixelsToWorld(JOIN_PX);
    const constraints: SketchConstraint[] = [];
    for (const own of endpointsOf(arc)) {
      for (const entity of existingEntities) {
        if (entity.id === arc.id || isConstruction(entity)) continue;
        const other = endpointsOf(entity).find(
          ({ point }) => Math.hypot(point.x - own.point.x, point.y - own.point.y) < tolerance,
        );
        if (!other) continue;
        constraints.push({
          id: `constraint-c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "coincident",
          anchors: [
            { entity_id: arc.id, sub_index: own.subIndex },
            { entity_id: entity.id, sub_index: other.subIndex },
          ],
          value: null,
        });
      }
    }
    return constraints;
  }

  private acceptEnd(ctx: SketchToolContext): void {
    if (!this.start || !this.cursor) return;
    const chord = Math.hypot(this.cursor.x - this.start.x, this.cursor.y - this.start.y);
    if (chord <= ctx.pixelsToWorld(MIN_CHORD_PX)) return;
    this.end = this.cursor;
    this.stage = "via";
  }

  private arcThroughCursor(): SketchArc | null {
    if (!this.start || !this.end || !this.cursor || !this.currentId) return null;
    const shape = threePointArc(this.start, this.end, this.cursor);
    return shape ? { id: this.currentId, type: "arc", ...shape } : null;
  }

  private chord(from: SketchPoint, to: SketchPoint): SketchLine {
    return { id: this.currentId!, type: "line", start: { ...from }, end: { ...to } };
  }
}
