import type { MeshEntry, SceneContext } from "./types";
import { findByMesh, visibleMeshes } from "./types";
import { visibleBodyHits } from "./clipRaycast";

export interface FaceHit {
  entry: MeshEntry;
  faceId: string | number;
  point: [number, number, number];
}

export function raycastFace(context: SceneContext): FaceHit | null {
  const meshes = visibleMeshes(context.entries);
  if (meshes.length === 0) return null;
  context.raycaster().setFromCamera(context.pointer(), context.camera());
  const hits = visibleBodyHits(context, context.raycaster().intersectObjects(meshes, false));
  if (hits.length === 0 || hits[0].faceIndex == null) return null;
  const entry = findByMesh(context.entries, hits[0].object);
  const faceId = entry?.faceTriangleMap[hits[0].faceIndex];
  if (!entry || faceId === undefined) return null;
  return { entry, faceId, point: hits[0].point.toArray() };
}
