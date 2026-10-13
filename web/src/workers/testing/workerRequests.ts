import { vi } from "vitest";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import type { SketchEntity, TimelineEntry } from "@/types/api";
import { loadWorker, type WorkerReply } from "./workerHarness";

const ENDPOINT_TOLERANCE = 1e-6;

export async function loadQuietWorker(): Promise<void> {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await loadWorker();
}

export function line(id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity {
  return { id, type: "line", start: { x: x1, y: y1 }, end: { x: x2, y: y2 } };
}

export function arc(id: string, x: number, y: number, radius: number, startAngle: number, endAngle: number): SketchEntity {
  return { id, type: "arc", center: { x, y }, radius, startAngle, endAngle };
}

export function constructionCircle(id: string, x: number, y: number, radius: number): SketchEntity {
  return { id, type: "circle", center: { x, y }, radius, construction: true };
}

export function revolveRequest(entities: SketchEntity[], featureKey: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: "revolve",
    entities,
    plane: "XY",
    planeOffset: 0,
    planeBasis: null,
    axisOrigin: { x: 0, y: 0 },
    axis: "y",
    angle: 360,
    direction: "one_side",
    featureKey,
    ...overrides,
  };
}

export function booleanRequest(operation: "union" | "subtract" | "intersect", targetBodyId: string, toolBodyId: string, featureKey: string) {
  return { kind: "boolean", operation, targetBodyId, toolBodyId, featureKey };
}

export function browserEntry(patch: Partial<TimelineEntry> & Pick<TimelineEntry, "id" | "kind">): TimelineEntry {
  return { timestamp: "", label: patch.id, status: "ok", ...patch, params: { ...patch.params, engine: "browser_wasm" } };
}

export function rebuiltBodies(reply: WorkerReply): (WorkerReply & { bodyId: string })[] {
  return reply.bodies as (WorkerReply & { bodyId: string })[];
}

function samePoint(values: number[], offset: number, point: Vector3): boolean {
  return Math.hypot(values[offset] - point[0], values[offset + 1] - point[1], values[offset + 2] - point[2]) < ENDPOINT_TOLERANCE;
}

export function edgeBetween(reply: WorkerReply, from: Vector3, to: Vector3): string {
  const matches = (reply.mesh?.brep_topo.edges ?? []).filter((edge) => {
    const polyline = edge.polyline ?? [];
    const last = polyline.length - 3;
    if (last < 3) return false;
    return (samePoint(polyline, 0, from) && samePoint(polyline, last, to)) || (samePoint(polyline, 0, to) && samePoint(polyline, last, from));
  });
  if (matches.length !== 1) throw new Error(`Между точками ${from} и ${to} найдено рёбер: ${matches.length}.`);
  return String(matches[0].edge_id);
}
