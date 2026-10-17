export interface CombinePick {
  targetId: string | null;
  toolIds: string[];
}

export interface PickableBody {
  id: string;
  visible?: boolean;
  source?: unknown;
}

export function toggledBody(list: string[], bodyId: string): string[] {
  return list.includes(bodyId) ? list.filter((id) => id !== bodyId) : [...list, bodyId];
}

export function pickedForCombine(pick: CombinePick, bodyId: string): CombinePick {
  if (pick.targetId === bodyId) return { targetId: null, toolIds: pick.toolIds };
  if (pick.toolIds.includes(bodyId)) return { targetId: pick.targetId, toolIds: toggledBody(pick.toolIds, bodyId) };
  if (pick.targetId === null) return { targetId: bodyId, toolIds: pick.toolIds };
  return { targetId: pick.targetId, toolIds: [...pick.toolIds, bodyId] };
}

export function withCombineTarget(pick: CombinePick, bodyId: string): CombinePick {
  return { targetId: bodyId, toolIds: pick.toolIds.filter((id) => id !== bodyId) };
}

export function withCombineTool(pick: CombinePick, bodyId: string): CombinePick {
  if (pick.toolIds.includes(bodyId)) return pick;
  return { targetId: pick.targetId === bodyId ? null : pick.targetId, toolIds: [...pick.toolIds, bodyId] };
}

export function isBrowserKernelBody(body: PickableBody): boolean {
  const kind = (body.source as { kind?: unknown } | undefined)?.kind;
  return typeof kind === "string" && kind.startsWith("browser_");
}

export function defaultCutTargets(bodies: PickableBody[]): string[] {
  return bodies.filter((body) => body.visible !== false && isBrowserKernelBody(body)).map((body) => body.id);
}

export function liveCutTargets(selected: string[], bodies: PickableBody[]): string[] {
  const pickable = new Set(defaultCutTargets(bodies));
  return selected.filter((id) => pickable.has(id));
}
