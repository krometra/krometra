import { measureVolume } from "replicad";
import { assertBrowserVolumeChanged, browserBooleanOfExtrude } from "@/lib/browserBoolean";
import { boxCorners, flatPoints } from "@/lib/browserExtrudeExtent";
import { browserExtrudeFrame, type Vector3 } from "@/lib/browserExtrudeFrame";
import { browserSpanFromPoints } from "@/lib/browserExtentTarget";
import { browserProfileSelection } from "@/lib/browserProfile";
import { worldProbes } from "@/lib/browserSweepNaming";
import { namedBoolean } from "./boolean";
import { facePointsByName, namedFromSweep, type NamedShape } from "./naming";
import { sweepProfiles } from "./profile";
import { shapeMesh } from "./shapes";
import type { BodyLookup, ExtrudeRequest } from "./types";

function boundingBoxPoints(named: NamedShape): Vector3[] {
  const box = named.shape.boundingBox;
  try {
    const [min, max] = box.bounds;
    return boxCorners(min as Vector3, max as Vector3);
  } finally {
    box.delete();
  }
}

function upToFacePoints(request: ExtrudeRequest, lookup: BodyLookup): Vector3[] {
  const faceName = request.upToFaceId === null || request.upToFaceId === undefined ? null : String(request.upToFaceId);
  const body = faceName && request.upToBodyId ? lookup(request.upToBodyId) : null;
  if (body && faceName && body.naming.faces.includes(faceName)) return facePointsByName(body, faceName);
  if (!request.upToFacePoints?.length) throw new Error("Выберите грань, до которой выдавливать.");
  return request.upToFacePoints;
}

function extentPoints(request: ExtrudeRequest, lookup: BodyLookup): Vector3[] | null {
  if (request.extentType === "through_all") return boundingBoxPoints(lookup(request.targetBodyId));
  if (request.extentType === "up_to_body") return flatPoints(shapeMesh(lookup(request.upToBodyId).shape).vertices);
  if (request.extentType === "up_to_face") return upToFacePoints(request, lookup);
  return null;
}

export function combineWithTarget(
  tool: NamedShape,
  request: Pick<ExtrudeRequest, "operation" | "targetBodyId" | "featureKey">,
  lookup: BodyLookup,
): NamedShape {
  const booleanOperation = browserBooleanOfExtrude(request.operation);
  if (!booleanOperation) return tool;
  try {
    const target = lookup(request.targetBodyId);
    const result = namedBoolean(target, tool, booleanOperation, request.featureKey);
    try {
      assertBrowserVolumeChanged(request.operation, measureVolume(target.shape), measureVolume(result.shape));
      return result;
    } catch (error) {
      result.shape.delete();
      throw error;
    }
  } finally {
    tool.shape.delete();
  }
}

export function extrudeNamed(request: ExtrudeRequest, lookup: BodyLookup): NamedShape {
  const span = browserSpanFromPoints(request, request, extentPoints(request, lookup));
  const selection = browserProfileSelection(request.entities, request.profileRegions);
  const tool = sweepProfiles(selection.profiles, (center) => {
    const frame = browserExtrudeFrame({ ...request, center }, span);
    return { ...frame, sweep: (sketch) => sketch.extrude(frame.length, { extrusionDirection: frame.n }) };
  });
  const frame = browserExtrudeFrame({ ...request, center: { x: 0, y: 0 } }, span);
  const probes = worldProbes(selection.probes, frame, { x: 0, y: 0 }, {
    kind: "prism",
    direction: frame.n,
    length: frame.length,
  });
  return combineWithTarget(namedFromSweep(tool, request.featureKey, probes), request, lookup);
}
