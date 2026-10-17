import type { PlaneBasis, SketchEntity, SketchPlane, TimelineEntry } from "@/types/api";
import type { ModelDocument } from "./bodyHistory";
import { featureSketchIds } from "./browserRebuildPlan";
import { reseatSketchPlane, sketchFaceRef, type SketchSeatPlacement } from "./browserSketchSeat";
import type { TimelineEditResult } from "./timelineEdits";
import {
  definitionBodies,
  definitionSketches,
  placementOfFrame,
  WORK_PLANE_TYPE,
  WorkPlaneError,
  type SketchSource,
  type WorkPlaneDefinition,
  type WorkPlaneFrame,
} from "./workPlane";

export interface WorkPlaneComponent {
  type: typeof WORK_PLANE_TYPE;
  label: string;
  definition: WorkPlaneDefinition;
  ref_body_id: string | null;
  plane: SketchPlane;
  plane_offset: number;
  plane_basis: PlaneBasis;
  visible?: boolean;
}

export interface WorkPlaneEntry extends WorkPlaneComponent {
  id: string;
}

type Components = Record<string, unknown>;

const LABEL_PATTERN = /^Плоскость (\d+)$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function isWorkPlane(component: unknown): component is WorkPlaneComponent {
  const value = record(component);
  return value?.type === WORK_PLANE_TYPE && record(value.definition) !== null && record(value.plane_basis) !== null;
}

export function workPlaneEntries(components: Components): WorkPlaneEntry[] {
  return Object.entries(components)
    .filter((entry): entry is [string, WorkPlaneComponent] => isWorkPlane(entry[1]))
    .map(([id, component]) => ({ ...component, id }));
}

export function workPlaneOf(components: Components, planeId: string): WorkPlaneComponent {
  const plane = components[planeId];
  if (!isWorkPlane(plane)) throw new WorkPlaneError(`Рабочая плоскость «${planeId}» не найдена.`);
  return plane;
}

export function newWorkPlaneId(now = Date.now(), random = Math.random()): string {
  return `plane-${now.toString(36)}${Math.floor(random * 0xffff).toString(16).padStart(4, "0")}`;
}

export function nextWorkPlaneLabel(components: Components): string {
  const numbers = workPlaneEntries(components).map((plane) => Number(LABEL_PATTERN.exec(plane.label)?.[1] ?? 0));
  return `Плоскость ${Math.max(0, ...numbers) + 1}`;
}

function isSketch(component: unknown): component is Record<string, unknown> & { entities: SketchEntity[] } {
  return Array.isArray(record(component)?.entities);
}

export function sketchPlacementOf(sketch: Record<string, unknown>): SketchSeatPlacement {
  return {
    plane: (typeof sketch.plane === "string" ? sketch.plane : "XY") as SketchPlane,
    planeOffset: typeof sketch.plane_offset === "number" && Number.isFinite(sketch.plane_offset) ? sketch.plane_offset : 0,
    planeBasis: (sketch.plane_basis as PlaneBasis | null | undefined) ?? null,
  };
}

export function sketchSourceOf(components: Components, sketchId: string): SketchSource {
  const sketch = components[sketchId];
  if (!isSketch(sketch)) throw new WorkPlaneError("Эскиз, на который опирается плоскость, удалён.");
  return { entities: sketch.entities, placement: sketchPlacementOf(sketch) };
}

export function sketchPlaneId(sketch: unknown): string | null {
  const planeId = record(sketch)?.ref_plane_id;
  return typeof planeId === "string" && planeId.length > 0 ? planeId : null;
}

function sketchOwner(components: Components, sketchId: string): string | null {
  const sketch = record(components[sketchId]);
  const face = sketchFaceRef(sketch);
  if (face) return face.bodyId;
  const planeId = sketchPlaneId(sketch);
  const plane = planeId ? components[planeId] : null;
  return isWorkPlane(plane) ? plane.ref_body_id : null;
}

export function workPlaneOwner(definition: WorkPlaneDefinition, components: Components): string | null {
  const owners = new Set([
    ...definitionBodies(definition),
    ...definitionSketches(definition).map((sketchId) => sketchOwner(components, sketchId)).filter((id): id is string => id !== null),
  ]);
  if (owners.size > 1) throw new WorkPlaneError("Опоры рабочей плоскости должны принадлежать одному телу.");
  return owners.values().next().value ?? null;
}

export function sketchesOnPlane(components: Components, planeId: string): string[] {
  return Object.keys(components).filter((id) => isSketch(components[id]) && sketchPlaneId(components[id]) === planeId);
}

export function planeDependents(document: ModelDocument, planeId: string): TimelineEntry[] {
  const sketches = new Set(sketchesOnPlane(document.components, planeId));
  return document.timeline.filter((entry) => entry.kind !== "sketch" && featureSketchIds(entry).some((id) => sketches.has(id)));
}

function placementFields(placement: SketchSeatPlacement) {
  return { plane: placement.plane, plane_offset: placement.planeOffset, plane_basis: placement.planeBasis };
}

export function workPlaneComponent(
  label: string,
  definition: WorkPlaneDefinition,
  placement: SketchSeatPlacement,
  components: Components,
): WorkPlaneComponent {
  if (!placement.planeBasis) throw new WorkPlaneError("У рабочей плоскости нет базиса.");
  return {
    type: WORK_PLANE_TYPE,
    label,
    definition,
    ref_body_id: workPlaneOwner(definition, components),
    plane: placement.plane,
    plane_offset: placement.planeOffset,
    plane_basis: placement.planeBasis,
  };
}

export function addWorkPlane(document: ModelDocument, planeId: string, component: WorkPlaneComponent): ModelDocument {
  if (planeId in document.components) throw new WorkPlaneError(`Компонент «${planeId}» уже есть в документе.`);
  return { ...document, components: { ...document.components, [planeId]: component } };
}

export function movedPlacement(previous: SketchSeatPlacement, frame: WorkPlaneFrame, label: string): SketchSeatPlacement {
  return reseatSketchPlane(previous, { planar: true, point: frame.origin, normal: frame.n }, label);
}

export function editedPlacement(document: ModelDocument, planeId: string, frame: WorkPlaneFrame): SketchSeatPlacement {
  const plane = workPlaneOf(document.components, planeId);
  if (sketchesOnPlane(document.components, planeId).length === 0) return placementOfFrame(frame);
  return movedPlacement(sketchPlacementOf(plane as unknown as Record<string, unknown>), frame, plane.label);
}

export function editWorkPlane(
  document: ModelDocument,
  planeId: string,
  definition: WorkPlaneDefinition,
  placement: SketchSeatPlacement,
): TimelineEditResult {
  const plane = workPlaneOf(document.components, planeId);
  const fields = placementFields(placement);
  const sketches = sketchesOnPlane(document.components, planeId);
  const components: Components = {
    ...document.components,
    [planeId]: { ...workPlaneComponent(plane.label, definition, placement, document.components), visible: plane.visible },
  };
  for (const sketchId of sketches) components[sketchId] = { ...record(components[sketchId]), ...fields };
  const timeline = document.timeline.map((entry) => (
    entry.kind === "sketch" && entry.sketch_id && sketches.includes(entry.sketch_id) ? { ...entry, plane: placement.plane } : entry
  ));
  const roots = planeDependents(document, planeId).map((entry) => entry.id);
  const seeds = { roots, bodies: [] };
  return { document: { components, timeline }, seeds, restoreSeeds: seeds };
}

export function removeWorkPlane(document: ModelDocument, planeId: string): ModelDocument {
  workPlaneOf(document.components, planeId);
  const components: Components = { ...document.components };
  delete components[planeId];
  for (const sketchId of sketchesOnPlane(document.components, planeId)) {
    const { ref_plane_id: _detached, ...sketch } = record(components[sketchId]) ?? {};
    components[sketchId] = sketch;
  }
  return { ...document, components };
}

export function setWorkPlaneVisible(document: ModelDocument, planeId: string, visible: boolean): ModelDocument {
  const plane = workPlaneOf(document.components, planeId);
  return { ...document, components: { ...document.components, [planeId]: { ...plane, visible } } };
}
