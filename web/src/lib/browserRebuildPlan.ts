import type { TimelineEntry } from "@/types/api";
import { draftFeatureOfParams } from "./browserDraft";
import { mirrorPlaneOfParams } from "./mirrorPlane";
import { patternReferenceBodies } from "./bodyPattern";
import { patternModeOf, patternSpecFromParams } from "./bodyPatternParams";
import { sketchOwnerBody, sketchSeatSteps, type SketchSeatStep } from "./browserSketchSeat";
import { HOLE_EDITABLE_PARAMS, holeSpecFromParams } from "./holeFeature";
import { fallbackBodyOf, isSuppressed } from "./timelineFlags";

export type RebuildKind = "extrude" | "revolve" | "sweep" | "loft" | "boolean" | "fillet" | "chamfer" | "thread" | "import" | "transform" | "shell" | "mirror" | "hole" | "pattern" | "draft" | "press_pull";

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

const REBUILD_KINDS = new Set<string>(["extrude", "revolve", "sweep", "loft", "boolean", "fillet", "chamfer", "thread", "import", "transform", "shell", "mirror", "hole", "pattern", "draft", "press_pull"]);

const EDITABLE_PARAMS: Record<string, string[]> = {
  extrude: ["distance", "direction", "back_distance", "offset"],
  revolve: ["angle", "direction"],
  sweep: ["orientation"],
  loft: ["transition"],
  fillet: ["radius"],
  chamfer: ["distance1", "distance2"],
  thread: ["pitch", "length", "offset"],
  shell: ["thickness", "direction"],
  mirror: ["plane", "offset"],
  hole: [...HOLE_EDITABLE_PARAMS],
  pattern: ["count", "spacing", "angle", "count2", "spacing2"],
  draft: ["angle_deg"],
  press_pull: ["distance"],
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

export function outputBodiesOf(entry: TimelineEntry): string[] {
  if (Array.isArray(entry.body_ids)) return entry.body_ids.map(text).filter((id): id is string => id !== null);
  const output = outputBodyOf(entry);
  return output ? [output] : [];
}

function patternInputs(params: Record<string, unknown>): unknown[] {
  return [params.target_body_id, ...patternReferenceBodies(patternSpecFromParams(params))];
}

export function inputBodiesOf(entry: TimelineEntry): string[] {
  const params = entry.params ?? {};
  const ids = entry.kind === "boolean"
    ? [entry.target_body_id, entry.tool_body_id]
    : entry.kind === "pattern" ? patternInputs(params) : [params.target_body_id, params.up_to_body_id];
  return [...new Set(ids.map(text).filter((id): id is string => id !== null))];
}

function extraSketchIds(entry: TimelineEntry): unknown[] {
  if (entry.kind === "sweep") return [entry.params?.path_sketch_id];
  if (entry.kind === "loft") return loftSketchIds(entry.params ?? {});
  return [];
}

export function featureSketchIds(entry: TimelineEntry): string[] {
  if (entry.kind === "sketch") return [];
  return [...new Set([entry.sketch_id, ...extraSketchIds(entry)].map(text).filter((id): id is string => id !== null))];
}

function loftSketchIds(params: Record<string, unknown>): string[] {
  return Array.isArray(params.profile_sketch_ids) ? params.profile_sketch_ids.map(text).filter((id): id is string => id !== null) : [];
}

function profileRegionsOf(params: Record<string, unknown>): string[] | null {
  const keys = Array.isArray(params.profile_regions) ? params.profile_regions.map(text).filter((key): key is string => key !== null) : [];
  return keys.length > 0 ? keys : null;
}

function sketchPlacement(document: RebuildDocument, sketchId: string | null | undefined, label: string) {
  const sketch = document.components[sketchId ?? ""] as Record<string, unknown> | undefined;
  if (!sketch || !Array.isArray(sketch.entities)) throw new Error(`Эскиз операции «${label}» не найден.`);
  return {
    entities: sketch.entities,
    plane: text(sketch.plane) ?? "XY",
    planeOffset: number(sketch.plane_offset, 0),
    planeBasis: sketch.plane_basis ?? null,
  };
}

function extrudeRequest(document: RebuildDocument, entry: TimelineEntry, params: Record<string, unknown>) {
  return {
    ...sketchPlacement(document, entry.sketch_id, entry.label),
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
    profileRegions: profileRegionsOf(params),
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

function shellRequest(params: Record<string, unknown>) {
  return {
    bodyId: text(params.target_body_id),
    faceNames: Array.isArray(params.face_ids) ? params.face_ids.map(String) : [],
    thickness: number(params.thickness, 1),
    direction: text(params.direction) ?? "inward",
  };
}

function pressPullRequest(params: Record<string, unknown>) {
  return {
    bodyId: text(params.target_body_id),
    faceNames: Array.isArray(params.face_ids) ? params.face_ids.map(String) : [],
    distance: number(params.distance, 1),
    newBody: params.new_body === true,
  };
}

function holeRequest(document: RebuildDocument, entry: TimelineEntry, params: Record<string, unknown>) {
  const placement = entry.sketch_id ? sketchPlacement(document, entry.sketch_id, entry.label) : { entities: null, plane: "XY", planeOffset: 0, planeBasis: null };
  return {
    ...placement,
    bodyId: text(params.target_body_id),
    faceId: text(params.face_id),
    facePoints: [],
    centers: Array.isArray(params.centers) ? params.centers : [],
    spec: holeSpecFromParams(params),
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
      ...sketchPlacement(document, entry.sketch_id, entry.label),
      axisOrigin: params.axis_origin,
      axis: params.axis,
      angle: number(params.angle, 360),
      direction: text(params.direction) ?? "one_side",
      profileRegions: profileRegionsOf(params),
    };
  }
  if (entry.kind === "sweep") {
    return {
      kind: "sweep",
      featureKey,
      ...sketchPlacement(document, entry.sketch_id, entry.label),
      path: sketchPlacement(document, text(params.path_sketch_id), entry.label),
      orientation: text(params.orientation) ?? "corrected",
      operation: text(params.operation) ?? "new_body",
      targetBodyId: text(params.target_body_id),
    };
  }
  if (entry.kind === "loft") {
    return {
      kind: "loft",
      featureKey,
      sections: loftSketchIds(params).map((sketchId) => sketchPlacement(document, sketchId, entry.label)),
      ruled: params.transition === "ruled",
      operation: text(params.operation) ?? "new_body",
      targetBodyId: text(params.target_body_id),
    };
  }
  if (entry.kind === "boolean") {
    return { kind: "boolean", featureKey, operation: entry.operation, targetBodyId: entry.target_body_id, toolBodyId: entry.tool_body_id };
  }
  if (entry.kind === "thread") return { kind: "thread", featureKey, ...threadRequest(entry, params) };
  if (entry.kind === "hole") return { kind: "hole", featureKey, ...holeRequest(document, entry, params) };
  if (entry.kind === "transform") {
    return { kind: "transform", featureKey, bodyId: text(params.target_body_id), translate: params.translate, rotate: params.rotate ?? null };
  }
  if (entry.kind === "shell") return { kind: "shell", featureKey, ...shellRequest(params) };
  if (entry.kind === "draft") return { kind: "draft", featureKey, ...draftFeatureOfParams(params) };
  if (entry.kind === "press_pull") return { kind: "press_pull", featureKey, ...pressPullRequest(params) };
  if (entry.kind === "mirror") {
    return { kind: "mirror", featureKey, bodyId: text(params.target_body_id), plane: mirrorPlaneOfParams(params), merge: params.merge === true };
  }
  if (entry.kind === "pattern") {
    return { kind: "pattern", featureKey, bodyId: text(params.target_body_id), pattern: patternSpecFromParams(params), mode: patternModeOf(params), instance: null };
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

function bodyStep(
  document: RebuildDocument,
  entry: TimelineEntry,
  output: string,
  params: Record<string, unknown>,
  instance: number | null,
): RebuildStep | FailStep {
  const fallbackBodyId = fallbackBodyOf(entry);
  try {
    const base = requestOf(document, entry, params);
    const request = instance === null ? base : { ...base, instance };
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
    const outputs = outputBodiesOf(entry);
    if (!isBrowserFeature(entry) || outputs.length === 0) {
      throw new Error(`Операция «${entry.label}» зависит от изменённой, но не поддерживает пересборку в браузере.`);
    }
    const params = override?.entryId === entry.id ? { ...entry.params, ...override.params } : entry.params ?? {};
    outputs.forEach((output, index) => {
      if (isSuppressed(entry)) {
        steps.push({ kind: "alias", entryId: entry.id, bodyId: output, fallbackBodyId: fallbackBodyOf(entry) });
      } else {
        const instance = Array.isArray(entry.body_ids) ? index + 1 : null;
        const step = bodyStep(document, entry, output, params, instance);
        steps.push(step.kind !== "fail" && entry.sketch_id && seated.has(entry.sketch_id) ? { ...step, sketchId: entry.sketch_id } : step);
      }
      markDirty(output);
    });
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
    if (!featureSketchIds(entry).includes(sketchId) || covered.has(entry.id)) continue;
    browserRebuildPlan(document, entry.id, {}).forEach((step) => covered.add(step.entryId));
    roots.push(entry.id);
  }
  return roots;
}
