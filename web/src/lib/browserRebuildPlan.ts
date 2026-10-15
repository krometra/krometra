import type { TimelineEntry } from "@/types/api";
import { sketchOwnerBody, sketchSeatSteps, type SketchSeatStep } from "./browserSketchSeat";

export type RebuildKind = "extrude" | "revolve" | "boolean" | "fillet" | "chamfer" | "thread" | "import" | "transform" | "shell";

export interface RebuildStep {
  entryId: string;
  kind: RebuildKind;
  outputBodyId: string;
  inputBodyIds: string[];
  request: Record<string, unknown>;
  sketchId?: string;
}

export type RebuildPlanStep = RebuildStep | SketchSeatStep;

export function isBodyStep(step: RebuildPlanStep): step is RebuildStep {
  return step.kind !== "sketch_plane";
}

export interface RebuildDocument {
  components: Record<string, unknown>;
  timeline: TimelineEntry[];
}

const REBUILD_KINDS = new Set<string>(["extrude", "revolve", "boolean", "fillet", "chamfer", "thread", "import", "transform", "shell"]);

const EDITABLE_PARAMS: Record<string, string[]> = {
  extrude: ["distance", "direction", "back_distance", "offset"],
  revolve: ["angle", "direction"],
  fillet: ["radius"],
  chamfer: ["distance1", "distance2"],
  thread: ["pitch", "length", "offset"],
  shell: ["thickness", "direction"],
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

function shellRequest(params: Record<string, unknown>) {
  return {
    bodyId: text(params.target_body_id),
    faceNames: Array.isArray(params.face_ids) ? params.face_ids.map(String) : [],
    thickness: number(params.thickness, 1),
    direction: text(params.direction) ?? "inward",
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
  if (entry.kind === "shell") return { kind: "shell", featureKey, ...shellRequest(params) };
  const edgeNames = Array.isArray(params.edge_ids) ? params.edge_ids.map(String) : [];
  const bodyId = text(params.target_body_id);
  if (entry.kind === "fillet") return { kind: "fillet", featureKey, bodyId, edgeNames, radius: number(params.radius, 1) };
  return { kind: "chamfer", featureKey, bodyId, edgeNames, distance1: number(params.distance1, 1), distance2: number(params.distance2, 1) };
}

export function browserRebuildPlan(
  document: RebuildDocument,
  entryId: string,
  newParams: Record<string, unknown>,
): RebuildPlanStep[] {
  const start = document.timeline.findIndex((entry) => entry.id === entryId);
  if (start < 0) throw new Error("Операция не найдена в истории.");
  const changed = document.timeline[start];
  if (!isBrowserFeature(changed)) throw new Error("Пересобрать можно только операцию браузерного ядра.");
  const affected = new Set<string>();
  const seated = new Set<string>();
  const steps: RebuildPlanStep[] = [];
  document.timeline.slice(start).forEach((entry, offset) => {
    const inputs = inputBodiesOf(entry);
    const output = outputBodyOf(entry);
    const owner = sketchOwnerBody(document, entry);
    if (offset > 0 && !inputs.some((id) => affected.has(id)) && !(owner && affected.has(owner))) return;
    if (!isBrowserFeature(entry) || !output) {
      throw new Error(`Операция «${entry.label}» зависит от изменённой, но не поддерживает пересборку в браузере.`);
    }
    const params = offset === 0 ? { ...entry.params, ...newParams } : entry.params ?? {};
    const step: RebuildStep = { entryId: entry.id, kind: entry.kind as RebuildKind, outputBodyId: output, inputBodyIds: inputs, request: requestOf(document, entry, params) };
    steps.push(entry.sketch_id && seated.has(entry.sketch_id) ? { ...step, sketchId: entry.sketch_id } : step);
    affected.add(output);
    for (const seat of sketchSeatSteps(document, output)) {
      seated.add(seat.sketchId);
      steps.push(seat);
    }
  });
  return steps;
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
