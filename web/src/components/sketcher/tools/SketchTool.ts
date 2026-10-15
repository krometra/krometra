// Base interface for sketch drawing tools
import type { SketchEntity, SketchConstraint, SketchPoint } from "@/types/api";

export interface SketchToolContext {
  /** Convert screen coordinates to sketch (world) coordinates */
  screenToWorld: (sx: number, sy: number) => SketchPoint;
  /** Generate a unique entity id */
  nextId: () => string;
  /** Convert a screen-pixel distance to world units at the current zoom */
  pixelsToWorld: (px: number) => number;
}

export interface SketchTool {
  /** Called on mouse down */
  onMouseDown(sx: number, sy: number, ctx: SketchToolContext): void;
  /** Called on mouse move */
  onMouseMove(sx: number, sy: number, ctx: SketchToolContext): void;
  /** Called on mouse up; may produce several entities (e.g. rectangle → 4 lines) */
  onMouseUp(sx: number, sy: number, ctx: SketchToolContext): SketchEntity | SketchEntity[] | null;
  /** Get a preview entity for live rendering (or null) */
  getPreview(): SketchEntity | null;
  /** Reset tool state */
  reset(): void;
  /** Whether the tool is actively drawing (mid-operation) */
  isActive(): boolean;
  hint?(): string;
  /** Auto-detect constraints after entity creation */
  detectConstraints?(
    ctx: SketchToolContext,
    existingEntities: SketchEntity[]
  ): SketchConstraint[];
}
