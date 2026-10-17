import { getOC } from "replicad";
import type { gp_Trsf } from "replicad-opencascadejs";
import { basePlaneFrame, mirroredFaceName, type MirrorFrame, type MirrorPlane } from "@/lib/mirrorPlane";
import type { Vec3 } from "@/lib/threadGeometry";
import { namedBoolean, shape3DOf } from "./boolean";
import { faceByName, namedFromHistory, type NamedShape } from "./naming";
import type { BodyLookup } from "./types";

export interface MirrorRequest {
  id: number;
  kind: "mirror";
  bodyId: string;
  plane: MirrorPlane;
  merge: boolean;
  featureKey: string;
}

export function planarFaceFrame(source: NamedShape, faceId: string, notPlanar: string): MirrorFrame {
  const face = faceByName(source, faceId);
  try {
    if (face.geomType !== "PLANE") throw new Error(notPlanar);
    const point = face.pointOnSurface(0.5, 0.5);
    const normal = face.normalAt(point);
    try {
      return { origin: point.toTuple() as Vec3, normal: normal.toTuple() as Vec3 };
    } finally {
      point.delete();
      normal.delete();
    }
  } finally {
    face.delete();
  }
}

export function mirrorFrame(source: NamedShape, plane: MirrorPlane): MirrorFrame {
  return plane.kind === "base" ? basePlaneFrame(plane.plane, plane.offset) : planarFaceFrame(source, plane.faceId, "Зеркалить можно только относительно плоской грани.");
}

function mirrorTrsf(frame: MirrorFrame): gp_Trsf {
  const oc = getOC();
  const point = new oc.gp_Pnt(frame.origin[0], frame.origin[1], frame.origin[2]);
  const direction = new oc.gp_Dir(frame.normal[0], frame.normal[1], frame.normal[2]);
  const ax2 = new oc.gp_Ax2(point, direction);
  const trsf = new oc.gp_Trsf();
  try {
    trsf.SetMirror(ax2);
    return trsf;
  } finally {
    ax2.delete();
    direction.delete();
    point.delete();
  }
}

export function mirroredCopy(source: NamedShape, frame: MirrorFrame, featureKey: string): NamedShape {
  const oc = getOC();
  const trsf = mirrorTrsf(frame);
  const algorithm = new oc.BRepBuilderAPI_Transform(source.shape.wrapped, trsf, true, false);
  try {
    if (!algorithm.IsDone()) throw new Error("Браузерное ядро не смогло отразить тело.");
    const result = shape3DOf(algorithm.Shape(), "Результат зеркального отражения не является телом.");
    const renamed = { shape: source.shape, naming: { faces: source.naming.faces.map((name) => mirroredFaceName(featureKey, name)), edges: [] } };
    return namedFromHistory({ algorithm, inputs: [renamed], result, featureKey });
  } finally {
    algorithm.delete();
    trsf.delete();
  }
}

export function mirrorNamed(request: MirrorRequest, lookup: BodyLookup): NamedShape {
  const source = lookup(request.bodyId);
  const mirrored = mirroredCopy(source, mirrorFrame(source, request.plane), request.featureKey);
  if (!request.merge) return mirrored;
  try {
    return namedBoolean(source, mirrored, "union", request.featureKey);
  } finally {
    mirrored.shape.delete();
  }
}
