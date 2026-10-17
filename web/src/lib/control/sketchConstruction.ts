import type { SketchEntity } from "@/types/api";
import { canBeConstruction, setConstructionFlag, toggledConstructionFlag } from "@/sketcher/construction";
import { fail } from "./protocol";

export function constructionEdit(
  entities: SketchEntity[],
  entityIds: string[],
  construction: boolean | undefined,
): { entities: SketchEntity[]; construction: boolean } {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  for (const id of entityIds) {
    const entity = byId.get(id);
    if (!entity) throw fail("invalid_params", `В эскизе нет сущности «${id}».`);
    if (!canBeConstruction(entity)) throw fail("invalid_params", `Бесконечная прямая «${id}» всегда вспомогательная.`);
  }
  const flag = construction ?? toggledConstructionFlag(entities, entityIds) ?? true;
  return { entities: setConstructionFlag(entities, entityIds, flag), construction: flag };
}
