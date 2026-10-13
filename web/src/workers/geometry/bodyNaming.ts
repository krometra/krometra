import type { Shape3D } from "replicad";
import type { BodyNaming } from "@/lib/browserNaming";
import { namedFresh, type NamedShape } from "./naming";

const bodyNamings = new Map<string, BodyNaming>();
const pendingNamings = new Map<string, BodyNaming>();

export function namedBody(bodyId: string, shape: Shape3D): NamedShape {
  const naming = bodyNamings.get(bodyId);
  if (naming) return { shape, naming };
  const named = namedFresh(shape, bodyId);
  bodyNamings.set(bodyId, named.naming);
  return named;
}

export function holdPendingNaming(shapeHandle: string, naming: BodyNaming) {
  pendingNamings.set(shapeHandle, naming);
}

export function retainPendingNaming(shapeHandle: string, bodyId: string) {
  const naming = pendingNamings.get(shapeHandle);
  pendingNamings.delete(shapeHandle);
  if (naming) bodyNamings.set(bodyId, naming);
  else bodyNamings.delete(bodyId);
}

export function setBodyNaming(bodyId: string, naming: BodyNaming) {
  bodyNamings.set(bodyId, naming);
}

export function forgetNaming(key: { shapeHandle?: string; bodyId?: string }) {
  if (key.shapeHandle) pendingNamings.delete(key.shapeHandle);
  if (key.bodyId) bodyNamings.delete(key.bodyId);
}
