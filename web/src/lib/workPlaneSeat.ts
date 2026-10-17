import type { TimelineEntry } from "@/types/api";
import type { SketchSeatPlacement } from "./browserSketchSeat";
import { computeWorkPlaneFrame, definitionSketches, WorkPlaneError, type SketchSource, type WorkPlaneDefinition, type WorkPlaneGeometry } from "./workPlane";
import { movedPlacement, sketchesOnPlane, sketchPlacementOf, sketchSourceOf, workPlaneEntries } from "./workPlaneDocument";

export interface SeatedSketchRef {
  sketchId: string;
  entryId: string;
}

export interface WorkPlaneSeatStep {
  kind: "work_plane";
  entryId: string;
  planeId: string;
  label: string;
  bodyId: string;
  definition: WorkPlaneDefinition;
  placement: SketchSeatPlacement;
  sketches: Record<string, SketchSource>;
  seated: SeatedSketchRef[];
}

export type BodyGeometry = Pick<WorkPlaneGeometry, "face" | "edge">;

interface SeatDocument {
  components: Record<string, unknown>;
  timeline: TimelineEntry[];
}

function referencedSketches(document: SeatDocument, definition: WorkPlaneDefinition): Record<string, SketchSource> {
  const sources: Record<string, SketchSource> = {};
  for (const sketchId of definitionSketches(definition)) {
    try {
      sources[sketchId] = sketchSourceOf(document.components, sketchId);
    } catch {
      continue;
    }
  }
  return sources;
}

function seatedSketches(document: SeatDocument, planeId: string): SeatedSketchRef[] {
  return sketchesOnPlane(document.components, planeId).map((sketchId) => ({
    sketchId,
    entryId: document.timeline.find((entry) => entry.kind === "sketch" && entry.sketch_id === sketchId)?.id ?? sketchId,
  }));
}

export function workPlaneSeatSteps(document: SeatDocument, bodyId: string): WorkPlaneSeatStep[] {
  return workPlaneEntries(document.components)
    .filter((plane) => plane.ref_body_id === bodyId)
    .map((plane) => ({
      kind: "work_plane" as const,
      entryId: plane.id,
      planeId: plane.id,
      label: plane.label,
      bodyId,
      definition: plane.definition,
      placement: sketchPlacementOf(plane as unknown as Record<string, unknown>),
      sketches: referencedSketches(document, plane.definition),
      seated: seatedSketches(document, plane.id),
    }));
}

export function reseatWorkPlane(
  step: WorkPlaneSeatStep,
  body: BodyGeometry,
  seatOf: (sketchId: string) => SketchSeatPlacement | undefined,
): SketchSeatPlacement {
  const geometry: WorkPlaneGeometry = {
    face: (ref) => body.face(ref),
    edge: (ref) => body.edge(ref),
    sketch: (sketchId) => {
      const source = step.sketches[sketchId];
      if (!source) throw new WorkPlaneError("Эскиз, на который опирается плоскость, удалён.");
      return { entities: source.entities, placement: seatOf(sketchId) ?? source.placement };
    },
  };
  try {
    return movedPlacement(step.placement, computeWorkPlaneFrame(step.definition, geometry), step.label);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`«${step.label}»: ${reason}`);
  }
}
