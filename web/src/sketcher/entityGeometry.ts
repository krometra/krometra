import type { SketchEntity, SketchPoint } from "@/types/api";

/**
 * Геометрические характеристики сущностей эскиза, нужные и рендеру,
 * и подгонке вида: центр, характерная точка, угол, bbox.
 */

export function entityCenter(entity: SketchEntity): SketchPoint | null {
  switch (entity.type) {
    case "infline":
      return { x: entity.point.x, y: entity.point.y };
    case "line":
      return {
        x: (entity.start.x + entity.end.x) / 2,
        y: (entity.start.y + entity.end.y) / 2,
      };
    case "rectangle":
      return {
        x: (entity.corner1.x + entity.corner2.x) / 2,
        y: (entity.corner1.y + entity.corner2.y) / 2,
      };
    case "circle":
    case "arc":
      return entity.center ? { x: entity.center.x, y: entity.center.y } : null;
  }
}

export function entityPoint(entity: SketchEntity, subIndex: number): SketchPoint | null {
  switch (entity.type) {
    case "infline":
      return entity.point;
    case "line":
      return subIndex === 0 ? entity.start : entity.end;
    case "rectangle":
      return subIndex === 0 ? entity.corner1 : entity.corner2;
    case "circle":
    case "arc": {
      if (!entity.center || !entity.radius) return null;
      const angle = subIndex === 0 ? 0 : entity.type === "arc" ? entity.startAngle : Math.PI / 2;
      return {
        x: entity.center.x + entity.radius * Math.cos(angle),
        y: entity.center.y + entity.radius * Math.sin(angle),
      };
    }
  }
}

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
