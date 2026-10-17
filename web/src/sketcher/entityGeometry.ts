import type { SketchEntity } from "@/types/api";

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function entityBBox(entity: SketchEntity): BBox {
  switch (entity.type) {
    case "infline":
      return { x1: entity.point.x, y1: entity.point.y, x2: entity.point.x, y2: entity.point.y };
    case "line":
      return {
        x1: Math.min(entity.start.x, entity.end.x),
        y1: Math.min(entity.start.y, entity.end.y),
        x2: Math.max(entity.start.x, entity.end.x),
        y2: Math.max(entity.start.y, entity.end.y),
      };
    case "rectangle":
      return {
        x1: Math.min(entity.corner1.x, entity.corner2.x),
        y1: Math.min(entity.corner1.y, entity.corner2.y),
        x2: Math.max(entity.corner1.x, entity.corner2.x),
        y2: Math.max(entity.corner1.y, entity.corner2.y),
      };
    case "circle":
    case "arc": {
      const r = entity.radius;
      return {
        x1: entity.center.x - r,
        y1: entity.center.y - r,
        x2: entity.center.x + r,
        y2: entity.center.y + r,
      };
    }
  }
}
