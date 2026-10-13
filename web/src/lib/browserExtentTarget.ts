import type { MeshData, PlaneBasis, SketchPlane } from "@/types/api";
import {
  boxCorners,
  browserExtrudeSpan,
  flatPoints,
  projectOntoNormal,
  type BrowserExtentType,
  type BrowserExtrudeExtent,
  type BrowserExtrudeSpan,
} from "./browserExtrudeExtent";
import { browserPlaneFrame, type Vector3 } from "./browserExtrudeFrame";
import { browserFacePoints } from "./browserFacePlane";

export interface BrowserExtentTargets {
  targetBodyId: string | null;
  upToBodyId: string | null;
  upToFace: { bodyId: string; faceId: string | number } | null;
}

export function browserExtentMeshPoints(
  extentType: BrowserExtentType,
  targets: BrowserExtentTargets,
  meshOf: (bodyId: string | null) => MeshData | undefined,
): Vector3[] | null {
  if (extentType === "through_all") {
    const mesh = meshOf(targets.targetBodyId);
    return mesh ? boxCorners(mesh.bbox.min as Vector3, mesh.bbox.max as Vector3) : null;
  }
  if (extentType === "up_to_body") {
    const mesh = meshOf(targets.upToBodyId);
    return mesh ? flatPoints(mesh.vertices) : null;
  }
  if (extentType === "up_to_face" && targets.upToFace) {
    const mesh = meshOf(targets.upToFace.bodyId);
    return mesh ? browserFacePoints(mesh, targets.upToFace.faceId) : null;
  }
  return null;
}

export function browserSpanFromPoints(
  placement: { plane: SketchPlane; planeOffset: number; planeBasis: PlaneBasis | null },
  extent: BrowserExtrudeExtent,
  points: Vector3[] | null,
): BrowserExtrudeSpan {
  const frame = browserPlaneFrame({ ...placement, center: { x: 0, y: 0 } });
  return browserExtrudeSpan(extent, points && projectOntoNormal(points, frame.origin, frame.n));
}
