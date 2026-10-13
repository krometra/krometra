import type { MeshData, SketchEntity } from "@/types/api";
import type { SavedNaming } from "@/lib/browserNaming";

export interface WorkerReply {
  id: number;
  ok: boolean;
  error?: string;
  step?: ArrayBuffer;
  mesh?: MeshData;
  naming?: SavedNaming;
  shapeHandle?: string;
  file?: ArrayBuffer;
  [key: string]: unknown;
}

type WorkerScope = {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => Promise<void>) | null;
};

const replies: WorkerReply[] = [];
let nextId = 1;
let loaded: Promise<void> | null = null;

export function loadWorker(): Promise<void> {
  if (!loaded) {
    const scope = globalThis as unknown as WorkerScope;
    scope.postMessage = (message) => replies.push(message as WorkerReply);
    loaded = import("../browser-geometry.worker").then(() => undefined);
  }
  return loaded;
}

export async function send(request: Record<string, unknown>): Promise<WorkerReply> {
  await loadWorker();
  const id = nextId++;
  await (globalThis as unknown as WorkerScope).onmessage?.({ data: { id, ...request } });
  const reply = replies.find((message) => message.id === id);
  if (!reply) throw new Error(`Нет ответа на запрос ${id}`);
  return reply;
}

export async function sendOk(request: Record<string, unknown>): Promise<WorkerReply> {
  const reply = await send(request);
  if (!reply.ok) throw new Error(reply.error);
  return reply;
}

export async function buildBody(request: Record<string, unknown>, bodyId: string): Promise<WorkerReply> {
  const reply = await sendOk(request);
  await sendOk({ kind: "retain", shapeHandle: reply.shapeHandle, bodyId });
  return reply;
}

export function rectangle(id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity {
  return { id, type: "rectangle", corner1: { x: x1, y: y1 }, corner2: { x: x2, y: y2 } };
}

export function circle(id: string, x: number, y: number, radius: number): SketchEntity {
  return { id, type: "circle", center: { x, y }, radius };
}

export function extrudeRequest(entities: SketchEntity[], featureKey: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: "extrude",
    entities,
    plane: "XY",
    planeOffset: 0,
    planeBasis: null,
    distance: 10,
    direction: "one_side",
    extentType: "distance",
    backDistance: 0,
    offset: 0,
    operation: "new_body",
    targetBodyId: null,
    upToBodyId: null,
    upToFaceId: null,
    upToFacePoints: null,
    featureKey,
    ...overrides,
  };
}

export function faceNames(reply: WorkerReply): string[] {
  return (reply.mesh?.brep_topo.faces ?? []).map((face) => String(face.face_id));
}

export function edgeNames(reply: WorkerReply): string[] {
  return (reply.mesh?.brep_topo.edges ?? []).map((edge) => String(edge.edge_id));
}
