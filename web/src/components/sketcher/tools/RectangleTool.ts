// Rectangle tool: drag corner-to-corner or click-move-click.
// Produces 4 line segments (not an atomic rectangle) so each side can
// participate in constraints, matching how real CAD sketchers work.

import type { SketchEntity, SketchLine, SketchRectangle, SketchPoint, SketchConstraint } from "@/types/api";
import type { SketchTool, SketchToolContext } from "./SketchTool";

export class RectangleTool implements SketchTool {
  private corner1: SketchPoint | null = null;
  private corner2: SketchPoint | null = null;
  private currentId: string | null = null;
  private drawing = false;
  private lastLineIds: string[] = [];
  private widthOverride: number | null = null;
  private heightOverride: number | null = null;

  onMouseDown(sx: number, sy: number, ctx: SketchToolContext): void {
    if (this.drawing) return;
    this.corner1 = ctx.screenToWorld(sx, sy);
    this.corner2 = this.corner1;
    this.currentId = ctx.nextId();
    this.drawing = true;
  }

  onMouseMove(sx: number, sy: number, ctx: SketchToolContext): void {
    if (this.drawing) {
      this.corner2 = ctx.screenToWorld(sx, sy);
    }
  }

  setDimensionOverride(width: number | null, height: number | null): void {
    this.widthOverride = width !== null && width > 0 ? width : null;
    this.heightOverride = height !== null && height > 0 ? height : null;
  }

  getSize(): { width: number; height: number } | null {
    const c2 = this.effectiveCorner2();
    if (!this.corner1 || !c2) return null;
    return {
      width: Math.abs(c2.x - this.corner1.x),
      height: Math.abs(c2.y - this.corner1.y),
    };
  }

  private effectiveCorner2(): SketchPoint | null {
    if (!this.corner1 || !this.corner2) return null;
    let { x, y } = this.corner2;
    if (this.widthOverride !== null) {
      x = this.corner1.x + (Math.sign(this.corner2.x - this.corner1.x) || 1) * this.widthOverride;
    }
    if (this.heightOverride !== null) {
      y = this.corner1.y + (Math.sign(this.corner2.y - this.corner1.y) || 1) * this.heightOverride;
    }
    return { x, y };
  }

  onMouseUp(_sx: number, _sy: number, ctx: SketchToolContext): SketchEntity[] | null {
    if (!this.drawing) return null;

    const c2 = this.effectiveCorner2();
    if (this.corner1 && c2 && this.currentId) {
      const minSize = ctx.pixelsToWorld(4);
      const widthOk = this.widthOverride !== null || Math.abs(c2.x - this.corner1.x) > minSize;
      const heightOk = this.heightOverride !== null || Math.abs(c2.y - this.corner1.y) > minSize;

      if (widthOk && heightOk) {
        const { x: x1, y: y1 } = this.corner1;
        const { x: x2, y: y2 } = c2;
        const corners: SketchPoint[] = [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 },
        ];
        const lines: SketchLine[] = corners.map((start, i) => ({
          id: `${this.currentId}-e${i}`,
          type: "line",
          start: { ...start },
          end: { ...corners[(i + 1) % 4] },
        }));
        this.lastLineIds = lines.map((l) => l.id);
        this.reset(false);
        return lines;
      }
    }
    // Too small: stay in drawing mode so the first click starts click-move-click flow
    return null;
  }

  getPreview(): SketchEntity | null {
    const c2 = this.effectiveCorner2();
    if (this.corner1 && c2 && this.currentId) {
      return {
        id: this.currentId,
        type: "rectangle",
        corner1: { ...this.corner1 },
        corner2: { ...c2 },
      } as SketchRectangle;
    }
    return null;
  }

  reset(clearLastLines = true): void {
    this.corner1 = null;
    this.corner2 = null;
    this.currentId = null;
    this.drawing = false;
    this.widthOverride = null;
    this.heightOverride = null;
    if (clearLastLines) this.lastLineIds = [];
  }

  isActive(): boolean {
    return this.drawing;
  }

  detectConstraints(
    _ctx: SketchToolContext,
    _existingEntities: SketchEntity[]
  ): SketchConstraint[] {
    if (this.lastLineIds.length !== 4) return [];
    const [bottom, right, top, left] = this.lastLineIds;
    const stamp = Date.now();

    const constraints: SketchConstraint[] = [
      { id: `c-h1-${stamp}`, type: "horizontal", anchors: [{ entity_id: bottom, sub_index: 0 }], value: null },
      { id: `c-h2-${stamp}`, type: "horizontal", anchors: [{ entity_id: top, sub_index: 0 }], value: null },
      { id: `c-v1-${stamp}`, type: "vertical", anchors: [{ entity_id: right, sub_index: 0 }], value: null },
      { id: `c-v2-${stamp}`, type: "vertical", anchors: [{ entity_id: left, sub_index: 0 }], value: null },
    ];

    this.lastLineIds.forEach((lineId, i) => {
      const next = this.lastLineIds[(i + 1) % 4];
      constraints.push({
        id: `c-c${i}-${stamp}`,
        type: "coincident",
        anchors: [
          { entity_id: lineId, sub_index: 1 },
          { entity_id: next, sub_index: 0 },
        ],
        value: null,
      });
    });

    this.lastLineIds = [];
    return constraints;
  }
}
