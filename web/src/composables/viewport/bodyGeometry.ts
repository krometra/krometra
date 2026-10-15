import * as THREE from "three";
import { planarFaceFrame, type FaceFrame } from "@/lib/faceFrame";
import type { Bounds } from "@/lib/sectionPlane";
import type { MeshEntry } from "./types";
import { findByBody } from "./types";

export function bodyFaceFrame(entries: MeshEntry[], bodyId: string, faceId: string | number): FaceFrame | null {
  const entry = findByBody(entries, bodyId);
  const index = entry?.mesh.geometry.getIndex();
  if (!entry || !index) return null;
  const position = entry.mesh.geometry.getAttribute("position");
  return planarFaceFrame({ vertices: position.array, indices: index.array, faceMap: entry.faceTriangleMap }, faceId);
}

export function visibleBounds(entries: MeshEntry[]): Bounds | null {
  const box = new THREE.Box3();
  for (const entry of entries) {
    if (!entry.visible) continue;
    if (!entry.mesh.geometry.boundingBox) entry.mesh.geometry.computeBoundingBox();
    if (entry.mesh.geometry.boundingBox) box.union(entry.mesh.geometry.boundingBox);
  }
  return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
}
