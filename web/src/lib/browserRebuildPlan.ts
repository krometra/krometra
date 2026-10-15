import type { TimelineEntry } from "@/types/api";
import { sketchOwnerBody, sketchSeatSteps, type SketchSeatStep } from "./browserSketchSeat";
import { fallbackBodyOf, isSuppressed } from "./timelineFlags";

export type RebuildKind = "extrude" | "revolve" | "boolean" | "fillet" | "chamfer" | "thread" | "import" | "transform";

export interface RebuildStep {
  entryId: string;
  label: string;
  kind: RebuildKind;
  outputBodyId: string;
  inputBodyIds: string[];
  fallbackBodyId: string | null;
  request: Record<string, unknown>;
  sketchId?: string;
  required?: boolean;
}

export interface AliasStep {
  kind: "alias";
  entryId: string;
  bodyId: string;
  fallbackBodyId: string | null;
}

export interface FailStep {
  kind: "fail";
  entryId: string;
  outputBodyId: string;
  fallbackBodyId: string | null;
  message: string;
}

export type RebuildPlanStep = RebuildStep | SketchSeatStep | AliasStep | FailStep;

export interface RegenSeeds {
  roots: string[];
  bodies: string[];
}

export function isBodyStep(step: RebuildPlanStep): step is RebuildStep {
  return REBUILD_KINDS.has(step.kind);
}

export interface RebuildDocument {
  components: Record<string, unknown>;
  timeline: TimelineEntry[];
}

const REBUILD_KINDS = new Set<string>(["extrude", "revolve", "boolean", "fillet", "chamfer", "thread", "import", "transform"]);

const EDITABLE_PARAMS: Record<string, string[]> = {
  extrude: ["distance", "direction", "back_distance", "offset"],
  revolve: ["angle", "direction"],
  fillet: ["radius"],
  chamfer: ["distance1", "distance2"],
  thread: ["pitch", "length", "offset"],
};

export function editableBrowserParams(kind: string): string[] {
  return EDITABLE_PARAMS[kind] ?? [];
}

export function isBrowserFeature(entry: TimelineEntry): boolean {
  return entry.params?.engine === "browser_wasm" && REBUILD_KINDS.has(entry.kind);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function outputBodyOf(entry: TimelineEntry): string | null {
  return text(entry.kind === "boolean" ? entry.result_body_id : entry.body_id);
}

export function inputBodiesOf(entry: TimelineEntry): string[] {
  const params = entry.params ?? {};
  const ids = entry.kind === "boolean"
    ? [entry.target_body_id, entry.tool_body_id]
    : [params.target_body_id, params.up_to_body_id];
  return [...new Set(ids.map(text).filter((id): id is string => id !== null))];
}

function sketchPlacement(document: RebuildDocument, entry: TimelineEntry) {
  const sketch = document.components[entry.sketch_id ?? ""] as Record<string, unknown> | undefined;
  if (!sketch || !Array.isArray(sketch.entities)) throw new Error(`Эскиз операции «${entry.label}» не найден.`);
  return {
    entities: sketch.entities,
    plane: text(sketch.plane) ?? "XY",
    planeOffset: number(sketch.plane_offset, 0),
    planeBasis: sketch.plane_basis ?? null,
  };
}

function extrudeRequest(document: RebuildDocument, entry: TimelineEntry, params: Record<string, unknown>) {
  return {
    ...sketchPlacement(document, entry),
    distance: number(params.distance, 10),
    direction: text(params.direction) ?? "one_side",
    extentType: text(params.extent_type) ?? "distance",
    backDistance: number(params.back_distance, 0),
    offset: number(params.offset, 0),
    operation: text(params.operation) ?? "new_body",
    targetBodyId: text(params.target_body_id),
    upToBodyId: text(params.up_to_body_id),
    upToFaceId: text(params.up_to_face_id),
    upToFacePoints: null,
  };
}

function threadRequest(entry: TimelineEntry, params: Record<string, unknown>) {
  return {
    bodyId: text(params.target_body_id),
    faceId: text(params.face_id),
    facePoints: [],
    options: {
      pitch: number(params.pitch, 1),
      depth: typeof params.depth === "number" ? params.depth : null,
      length: number(params.length, 1),
      offset: number(params.offset, 0),
      crestRatio: number(params.crest_ratio, 0),
      starts: number(params.starts, 1),
      rightHanded: params.right_handed !== false,
    },
  };
}

function requestOf(document: RebuildDocument, entry: TimelineEntry, params: Record<string, unknown>): Record<string, unknown> {
  const featureKey = text(params.feature_key) ?? entry.id;
  if (entry.kind === "import") return { kind: "import", featureKey, bodyId: entry.body_id };
  if (entry.kind === "extrude") return { kind: "extrude", featureKey, ...extrudeRequest(document, entry, params) };
  if (entry.kind === "revolve") {
    return {
      kind: "revolve",
      featureKey,
      ...sketchPlacement(document, entry),
      axisOrigin: params.axis_origin,
      axis: params.axis,
      angle: number(params.angle, 360),
      direction: text(params.direction) ?? "one_side",
    };
  }
  if (entry.kind === "boolean") {
    return { kind: "boolean", featureKey, operation: entry.operation, targetBodyId: entry.target_body_id, toolBodyId: entry.tool_body_id };
  }
  if (entry.kind === "thread") return { kind: "thread", featureKey, ...threadRequest(entry, params) };
  if (entry.kind === "transform") {
    return { kind: "transform", featureKey, bodyId: text(params.target_body_id), translate: params.translate, rotate: params.rotate ?? null };
  }
  const edgeNames = Array.isArray(params.edge_ids) ? params.edge_ids.map(String) : [];
  const bodyId = text(params.target_body_id);
  if (entry.kind === "fillet") return { kind: "fillet", featureKey, bodyId, edgeNames, radius: number(params.radius, 1) };
  return { kind: "chamfer", featureKey, bodyId, edgeNames, distance1: number(params.distance1, 1), distance2: number(params.distance2, 1) };
}

function bodyComponents(document: RebuildDocument): Set<string> {
  return new Set(Object.entries(document.components)
    .filter(([, component]) => (component as { type?: unknown } | null)?.type === "body")
    .map(([id]) => id));
}

function dependencyBodies(document: RebuildDocument, entry: TimelineEntry): string[] {
  const owner = sketchOwnerBody(document, entry);
  return owner ? [...inputBodiesOf(entry), owner] : inputBodiesOf(entry);
}

function bodyStep(document: RebuildDocument, entry: TimelineEntry, output: string, params: Record<string, unknown>): RebuildStep | FailStep {
  const fallbackBodyId = fallbackBodyOf(entry);
  try {
    const request = requestOf(document, entry, params);
    return { entryId: entry.id, label: entry.label, kind: entry.kind as RebuildKind, outputBodyId: output, inputBodyIds: inputBodiesOf(entry), fallbackBodyId, request };
  } catch (error) {
    return { kind: "fail", entryId: entry.id, outputBodyId: output, fallbackBodyId, message: error instanceof Error ? error.message : String(error) };
  }
}

function missingBodyAlias(bodyId: string): AliasStep {
  return { kind: "alias", entryId: "", bodyId, fallbackBodyId: null };
}

export function browserRegenPlan(
  document: RebuildDocument,
  seeds: RegenSeeds,
  override: { entryId: string; params: Record<string, unknown> } | null = null,
): RebuildPlanStep[] {
  const roots = new Set(seeds.roots);
  const known = bodyComponents(document);
  const dirty = new Set<string>();
  const seated = new Set<string>();
  const steps: RebuildPlanStep[] = [];
  const markDirty = (bodyId: string) => {
    dirty.add(bodyId);
    for (const seat of sketchSeatSteps(document, bodyId)) {
      seated.add(seat.sketchId);
      steps.push(seat);
    }
  };
  seeds.bodies.filter((bodyId) => !known.has(bodyId)).forEach((bodyId) => steps.push(missingBodyAlias(bodyId)));
  seeds.bodies.forEach(markDirty);
  for (const entry of document.timeline) {
    const dependencies = dependencyBodies(document, entry);
    if (!roots.has(entry.id) && !dependencies.some((id) => dirty.has(id))) continue;
    const output = outputBodyOf(entry);
    if (!isBrowserFeature(entry) || !output) {
      throw new Error(`Операция «${entry.label}» зависит от изменённой, но не поддерживает пересборку в браузере.`);
    }
    if (isSuppressed(entry)) {
      steps.push({ kind: "alias", entryId: entry.id, bodyId: output, fallbackBodyId: fallbackBodyOf(entry) });
    } else {
      const params = override?.entryId === entry.id ? { ...entry.params, ...override.params } : entry.params ?? {};
      const step = bodyStep(document, entry, output, params);
      steps.push(step.kind !== "fail" && entry.sketch_id && seated.has(entry.sketch_id) ? { ...step, sketchId: entry.sketch_id } : step);
    }
    markDirty(output);
  }
  return steps;
}

export function browserRebuildPlan(
  document: RebuildDocument,
  entryId: string,
  newParams: Record<string, unknown>,
): RebuildPlanStep[] {
  const changed = document.timeline.find((entry) => entry.id === entryId);
  if (!changed) throw new Error("Операция не найдена в истории.");
  if (!isBrowserFeature(changed)) throw new Error("Пересобрать можно только операцию браузерного ядра.");
  const steps = browserRegenPlan(document, { roots: [entryId], bodies: [] }, { entryId, params: newParams });
  const failed = steps.find((step): step is FailStep => step.kind === "fail" && step.entryId === entryId);
  if (failed) throw new Error(failed.message);
  return steps.map((step) => (isBodyStep(step) && step.entryId === entryId ? { ...step, required: true } : step));
}

export function sketchRebuildRoots(document: RebuildDocument, sketchId: string): string[] {
  const covered = new Set<string>();
  const roots: string[] = [];
  for (const entry of document.timeline) {
    if (entry.sketch_id !== sketchId || entry.kind === "sketch" || covered.has(entry.id)) continue;
    browserRebuildPlan(document, entry.id, {}).forEach((step) => covered.add(step.entryId));
    roots.push(entry.id);
  }
  return roots;
}
