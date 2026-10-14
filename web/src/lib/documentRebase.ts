export interface DocumentState {
  components: Record<string, unknown>;
  timeline: TimelineItem[];
}

export interface TimelineItem {
  id: string;
  [key: string]: unknown;
}

export type RebaseResult = { ok: true; state: DocumentState } | { ok: false; conflicts: string[] };

const PRESENTATION_KEYS = new Set(["visible", "color"]);

export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameJson(item, b[index]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => sameJson(a[key], b[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withoutPresentation(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PRESENTATION_KEYS.has(key)));
}

function sameContent(a: unknown, b: unknown): boolean {
  return sameJson(withoutPresentation(a), withoutPresentation(b));
}

function byId(timeline: TimelineItem[]): Record<string, TimelineItem> {
  return Object.fromEntries(timeline.map((entry) => [entry.id, entry]));
}

function changedKeys(from: Record<string, unknown>, to: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  return [...keys].filter((key) => !sameJson(from[key], to[key]));
}

function rebaseRecord(current: Record<string, unknown>, from: Record<string, unknown>, to: Record<string, unknown>) {
  const conflicts: string[] = [];
  const result = { ...current };
  for (const key of changedKeys(from, to)) {
    if (!sameContent(current[key], from[key])) conflicts.push(key);
    if (to[key] === undefined) delete result[key];
    else result[key] = to[key];
  }
  return { result, conflicts };
}

function rebaseOrder(current: TimelineItem[], to: TimelineItem[], entries: Record<string, unknown>): TimelineItem[] {
  const target = to.map((entry) => entry.id);
  const foreign = current.map((entry) => entry.id).filter((id) => !target.includes(id));
  return [...target, ...foreign].filter((id) => id in entries).map((id) => entries[id] as TimelineItem);
}

export function rebaseDocument(current: DocumentState, from: DocumentState, to: DocumentState): RebaseResult {
  const components = rebaseRecord(current.components, from.components, to.components);
  const timeline = rebaseRecord(byId(current.timeline), byId(from.timeline), byId(to.timeline));
  const conflicts = [...components.conflicts, ...timeline.conflicts];
  if (conflicts.length > 0) return { ok: false, conflicts };
  return { ok: true, state: { components: components.result, timeline: rebaseOrder(current.timeline, to.timeline, timeline.result) } };
}

export function removedBodyIds(from: DocumentState, to: DocumentState): string[] {
  return Object.keys(from.components).filter(
    (id) => to.components[id] === undefined && isRecord(from.components[id]) && from.components[id].type === "body",
  );
}
