import type { SketchEntity } from "@/types/api";

export function canBeConstruction(entity: SketchEntity): boolean {
  return entity.type !== "infline";
}

function withFlag(entity: SketchEntity, construction: boolean): SketchEntity {
  if (!canBeConstruction(entity)) return entity;
  if (construction) return { ...entity, construction: true } as SketchEntity;
  const { construction: _dropped, ...rest } = entity as SketchEntity & { construction?: boolean };
  return rest as SketchEntity;
}

export function asConstruction<T extends SketchEntity>(entity: T): T {
  return withFlag(entity, true) as T;
}

export function toggledConstructionFlag(entities: SketchEntity[], ids: readonly string[]): boolean | null {
  const wanted = new Set(ids);
  const targets = entities.filter((e) => wanted.has(e.id) && canBeConstruction(e));
  if (targets.length === 0) return null;
  return targets.some((e) => !(e as { construction?: boolean }).construction);
}

export function setConstructionFlag(entities: SketchEntity[], ids: readonly string[], construction: boolean): SketchEntity[] {
  const wanted = new Set(ids);
  return entities.map((e) => (wanted.has(e.id) ? withFlag(e, construction) : e));
}
