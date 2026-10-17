import type { ConstraintRef, SketchEntity, SketchPoint } from "@/types/api";
import type { Seg } from "./dimensionMeasure";
import { SKETCH_ORIGIN, SKETCH_ORIGIN_ID, axisDirection, type SketchAxis } from "./sketchOrigin";

export const LINE_MIDPOINT = 2;
export const REFERENCE_SPAN = 100;

export type PointRole = "end" | "mid" | "center" | "corner" | "origin";

export interface PointHandle {
  ref: ConstraintRef;
  at: SketchPoint;
  role: PointRole;
}

const ROLE_LABELS: Record<PointRole, string> = {
  end: "Конец",
  mid: "Середина",
  center: "Центр",
  corner: "Угол",
  origin: "Начало координат",
};

export function pointRoleLabel(role: PointRole): string {
  return ROLE_LABELS[role];
}

const handle = (entityId: string, subIndex: number, at: SketchPoint, role: PointRole): PointHandle => ({
  ref: { entity_id: entityId, sub_index: subIndex },
  at,
  role,
});

function onCircle(center: SketchPoint, radius: number, angle: number): SketchPoint {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

const midpoint = (a: SketchPoint, b: SketchPoint): SketchPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function rectangleCorners(entity: Extract<SketchEntity, { type: "rectangle" }>): SketchPoint[] {
  const { corner1, corner2 } = entity;
  return [corner1, corner2, { x: corner2.x, y: corner1.y }, { x: corner1.x, y: corner2.y }];
}

export function entityPointHandles(entity: SketchEntity): PointHandle[] {
  switch (entity.type) {
    case "line":
      return [
        handle(entity.id, 0, entity.start, "end"),
        handle(entity.id, 1, entity.end, "end"),
        handle(entity.id, LINE_MIDPOINT, midpoint(entity.start, entity.end), "mid"),
      ];
    case "circle":
      return [handle(entity.id, 0, entity.center, "center")];
    case "arc":
      return [
        handle(entity.id, 0, entity.center, "center"),
        handle(entity.id, 1, onCircle(entity.center, entity.radius, entity.startAngle), "end"),
        handle(entity.id, 2, onCircle(entity.center, entity.radius, entity.endAngle), "end"),
      ];
    case "rectangle":
      return rectangleCorners(entity).map((at, i) => handle(entity.id, i, at, "corner"));
    case "infline":
      return [];
  }
}

export function originHandle(): PointHandle {
  return handle(SKETCH_ORIGIN_ID, 0, { ...SKETCH_ORIGIN }, "origin");
}

export function sketchPointHandles(entities: SketchEntity[]): PointHandle[] {
  return [...entities.flatMap(entityPointHandles), originHandle()];
}

export function pointHandleOf(entity: SketchEntity, subIndex: number): PointHandle | null {
  return entityPointHandles(entity).find((h) => h.ref.sub_index === subIndex) ?? null;
}

function inflineSegment(entity: Extract<SketchEntity, { type: "infline" }>): Seg {
  const dir = { x: Math.cos(entity.angle), y: Math.sin(entity.angle) };
  return { start: entity.point, end: { x: entity.point.x + dir.x * REFERENCE_SPAN, y: entity.point.y + dir.y * REFERENCE_SPAN } };
}

export function entityRefPoint(entity: SketchEntity, subIndex: number): SketchPoint | null {
  switch (entity.type) {
    case "circle":
      if (subIndex === 1) return onCircle(entity.center, entity.radius, 0);
      return subIndex === 0 ? entity.center : null;
    case "infline": {
      const segment = inflineSegment(entity);
      return [segment.start, segment.end][subIndex] ?? null;
    }
    default:
      return pointHandleOf(entity, subIndex)?.at ?? null;
  }
}

export function entityLine(entity: SketchEntity): Seg | null {
  if (entity.type === "line") return { start: entity.start, end: entity.end };
  if (entity.type === "infline") return inflineSegment(entity);
  return null;
}

export function axisSegment(axis: SketchAxis): Seg {
  const dir = axisDirection(axis);
  return { start: { ...SKETCH_ORIGIN }, end: { x: dir.x * REFERENCE_SPAN, y: dir.y * REFERENCE_SPAN } };
}
