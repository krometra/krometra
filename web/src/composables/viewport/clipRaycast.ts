import type * as THREE from "three";
import type { SceneContext } from "./types";

const CLIP_TOLERANCE = 1e-4;

function clippingPlanes(context: SceneContext): readonly THREE.Plane[] {
  return context.renderer().clippingPlanes ?? [];
}

function isKept(point: THREE.Vector3, planes: readonly THREE.Plane[]): boolean {
  return planes.every((plane) => plane.distanceToPoint(point) >= -CLIP_TOLERANCE);
}

function insideMaterial(hit: THREE.Intersection, ray: THREE.Ray): boolean {
  return hit.face != null && hit.face.normal.dot(ray.direction) > 0;
}

export function unclippedHits<T extends THREE.Intersection>(context: SceneContext, hits: T[]): T[] {
  const planes = clippingPlanes(context);
  return planes.length === 0 ? hits : hits.filter((hit) => isKept(hit.point, planes));
}

export function visibleBodyHits<T extends THREE.Intersection>(context: SceneContext, hits: T[]): T[] {
  if (clippingPlanes(context).length === 0) return hits;
  const kept = unclippedHits(context, hits);
  return kept.length > 0 && insideMaterial(kept[0], context.raycaster().ray) ? [] : kept;
}
