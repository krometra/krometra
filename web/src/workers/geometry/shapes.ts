import { importSTEP, makeCompound } from "replicad";
import type { Shape3D } from "replicad";
import type { BrowserShapeMesh } from "@/lib/browserMesh";
import type { SavedNaming } from "@/lib/browserNaming";
import { forgetNaming, holdPendingNaming, namedBody, retainPendingNaming, setBodyNaming } from "./bodyNaming";
import { publishedBody } from "./namedMesh";
import { namedFromSaved, type NamedShape } from "./naming";
import { initOcct } from "./occt";

const MESH_OPTIONS = { tolerance: 0.01, angularTolerance: 0.5 };

let nextShapeHandle = 1;
const pendingShapes = new Map<string, Shape3D>();
const bodyShapes = new Map<string, Shape3D>();
const bodyRevisions = new Map<string, number>();
let nextRevision = 1;

function touchBody(bodyId: string) {
  bodyRevisions.set(bodyId, nextRevision++);
}

export function bodyRevision(bodyId: string): number {
  return bodyRevisions.get(bodyId) ?? 0;
}

export function bodyShape(bodyId: string | null) {
  const shape = bodyId ? bodyShapes.get(bodyId) : undefined;
  if (!shape) throw new Error("Тело не загружено в браузерное ядро. Обновите документ и повторите.");
  return shape;
}

export function namedBodyShape(bodyId: string | null): NamedShape {
  return namedBody(bodyId ?? "", bodyShape(bodyId));
}

export function shapeMesh(shape: { mesh(options?: typeof MESH_OPTIONS): BrowserShapeMesh }) {
  return shape.mesh(MESH_OPTIONS);
}

export function combineShapes(shapes: Shape3D[]): Shape3D {
  if (shapes.length === 1) return shapes[0];
  try {
    return makeCompound(shapes) as Shape3D;
  } finally {
    shapes.forEach((shape) => shape.delete());
  }
}

export async function publishShape(named: NamedShape, startedAt: number) {
  const { mesh, naming } = publishedBody(named);
  const step = await named.shape.blobSTEP().arrayBuffer();
  const shapeHandle = `shape-${nextShapeHandle++}`;
  pendingShapes.set(shapeHandle, named.shape);
  holdPendingNaming(shapeHandle, named.naming);
  return { step, mesh, naming, elapsedMs: Math.round(performance.now() - startedAt), shapeHandle };
}

export async function publishNamed(build: () => NamedShape) {
  await initOcct();
  const startedAt = performance.now();
  const named = build();
  try {
    return await publishShape(named, startedAt);
  } catch (error) {
    named.shape.delete();
    throw error;
  }
}

export function retainShape(shapeHandle?: string, bodyId?: string) {
  if (!shapeHandle || !bodyId) throw new Error("Не передано тело для сохранения в браузерном ядре.");
  const shape = pendingShapes.get(shapeHandle);
  if (!shape) throw new Error("Браузерное тело уже освобождено.");
  bodyShapes.get(bodyId)?.delete();
  pendingShapes.delete(shapeHandle);
  bodyShapes.set(bodyId, shape);
  retainPendingNaming(shapeHandle, bodyId);
  touchBody(bodyId);
}

export function replaceBodyShape(bodyId: string, named: NamedShape) {
  const previous = bodyShapes.get(bodyId);
  bodyShapes.set(bodyId, named.shape);
  setBodyNaming(bodyId, named.naming);
  touchBody(bodyId);
  if (previous && previous !== named.shape) previous.delete();
}

export function releaseShape(shapeHandle?: string, bodyId?: string) {
  const shape = shapeHandle ? pendingShapes.get(shapeHandle) : bodyId ? bodyShapes.get(bodyId) : null;
  if (!shape) return;
  shape.delete();
  if (shapeHandle) pendingShapes.delete(shapeHandle);
  if (bodyId) {
    bodyShapes.delete(bodyId);
    touchBody(bodyId);
  }
  forgetNaming({ shapeHandle, bodyId });
}

export async function hydrateShape(bodyId?: string, step?: ArrayBuffer, naming?: SavedNaming | null) {
  if (!bodyId || !step) throw new Error("Не переданы данные тела для восстановления в браузерном ядре.");
  await initOcct();
  const shape = await importSTEP(new Blob([step], { type: "application/step" })) as Shape3D;
  const named = namedFromSaved(shape, naming ?? null, bodyId);
  replaceBodyShape(bodyId, named);
  return naming ? {} : { mesh: publishedBody(named).mesh };
}
