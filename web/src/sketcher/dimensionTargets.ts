import type { SketchEntity, SketchPoint } from "@/types/api";
import type { DimensionTarget, PointTarget } from "./dimensionPlan";
import { pickSketchItem } from "./sketchPick";
import { SKETCH_AXIS_IDS } from "./sketchOrigin";
import { axisSegment, entityLine, originHandle, pointHandleOf, pointRoleLabel, type PointHandle } from "./sketchPoints";
import type { SketchSelectionItem } from "./sketchSelection";

const pointTarget = (handle: PointHandle): PointTarget => ({
  kind: "point",
  ref: { ...handle.ref },
  at: { ...handle.at },
  label: pointRoleLabel(handle.role),
});

export function targetOfEntity(entity: SketchEntity): DimensionTarget | null {
  const ref = { entity_id: entity.id, sub_index: 0 };
  switch (entity.type) {
    case "line":
      return { kind: "line", ref, segment: { start: entity.start, end: entity.end } };
    case "infline":
      return { kind: "line", ref, segment: entityLine(entity)!, infinite: true };
    case "circle":
    case "arc":
      return { kind: entity.type, ref, center: entity.center, radius: entity.radius };
    default:
      return null;
  }
}

export function targetOfSelection(item: SketchSelectionItem, entities: SketchEntity[]): DimensionTarget | null {
  switch (item.kind) {
    case "origin":
      return pointTarget(originHandle());
    case "axis":
      return { kind: "line", ref: { entity_id: SKETCH_AXIS_IDS[item.axis], sub_index: 0 }, segment: axisSegment(item.axis), infinite: true };
    case "entity": {
      const entity = entities.find((e) => e.id === item.entityId);
      return entity ? targetOfEntity(entity) : null;
    }
    case "point": {
      const entity = entities.find((e) => e.id === item.entityId);
      const handle = entity ? pointHandleOf(entity, item.subIndex) : null;
      return handle ? pointTarget(handle) : null;
    }
  }
}

export function pickDimensionTarget(world: SketchPoint, entities: SketchEntity[], threshold: number): DimensionTarget | null {
  const pick = pickSketchItem(world, entities, threshold);
  return pick ? targetOfSelection(pick.item, entities) : null;
}
