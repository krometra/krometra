import { Face, getOC, measureVolume } from "replicad";
import type { Shape3D } from "replicad";
import type { BRepOffsetAPI_DraftAngle, gp_Dir, gp_Pln } from "replicad-opencascadejs";
import {
  basePlaneNormal,
  draftAngleRad,
  draftFaceFailureMessage,
  draftFailureMessage,
  draftParamsError,
  draftPullDirection,
  type BrowserDraftFeature,
} from "@/lib/browserDraft";
import { resolveNames } from "@/lib/browserNaming";
import { largestWorkingRadius } from "@/lib/filletFailure";
import type { MirrorFrame } from "@/lib/mirrorPlane";
import type { Vec3 } from "@/lib/threadGeometry";
import { dot, unit } from "@/lib/vec3";
import { shape3DOf } from "./boolean";
import { isValidShape } from "./edgeOps";
import { planarFaceFrame } from "./mirror";
import { namedFromHistory, withTopology, type HistoryAlgorithm, type NamedShape } from "./naming";
import type { Topology } from "./topology";
import type { BodyLookup } from "./types";

export interface DraftRequest extends BrowserDraftFeature {
  id: number;
  kind: "draft";
  featureKey: string;
}

interface DraftInput {
  body: NamedShape;
  topology: Topology;
  faces: number[];
  frame: MirrorFrame;
  pull: Vec3;
}

interface BuiltDraft {
  algorithm: BRepOffsetAPI_DraftAngle;
  result: Shape3D;
}

const DRAFTABLE_SURFACES = new Set(["PLANE", "CYLINDRE", "CONE"]);
const PARALLEL_ALIGNMENT = 1 - 1e-9;

class DraftFaceError extends Error {}

function neutralFrame(body: NamedShape, neutral: BrowserDraftFeature["neutral"]): MirrorFrame {
  if (neutral.kind === "base") return { origin: [0, 0, 0], normal: basePlaneNormal(neutral.plane) };
  return planarFaceFrame(body, neutral.faceId, "Нейтральной плоскостью уклона может быть только плоская грань тела.");
}

function faceReason(topology: Topology, index: number, pull: Vec3): "surface" | "parallel" | "angle" {
  const face = new Face(getOC().TopoDS.Face(topology.faces[index]));
  try {
    if (!DRAFTABLE_SURFACES.has(face.geomType)) return "surface";
    if (face.geomType !== "PLANE") return "angle";
    const normal = face.normalAt();
    try {
      const direction = unit(normal.toTuple() as Vec3);
      return direction && Math.abs(dot(direction, pull)) >= PARALLEL_ALIGNMENT ? "parallel" : "angle";
    } finally {
      normal.delete();
    }
  } finally {
    face.delete();
  }
}

function occtPlane(frame: MirrorFrame): { plane: gp_Pln; release: () => void } {
  const oc = getOC();
  const origin = new oc.gp_Pnt(frame.origin[0], frame.origin[1], frame.origin[2]);
  const normal = new oc.gp_Dir(frame.normal[0], frame.normal[1], frame.normal[2]);
  const plane = new oc.gp_Pln(origin, normal);
  return { plane, release: () => [plane, normal, origin].forEach((value) => value.delete()) };
}

function addFace(algorithm: BRepOffsetAPI_DraftAngle, input: DraftInput, index: number, angle: number, axes: { pull: gp_Dir; plane: gp_Pln }): boolean {
  const face = getOC().TopoDS.Face(input.topology.faces[index]);
  try {
    algorithm.Add(face, axes.pull, angle, axes.plane, true);
    return algorithm.AddDone();
  } catch {
    return false;
  } finally {
    face.delete();
  }
}

function runDraft(algorithm: BRepOffsetAPI_DraftAngle, input: DraftInput, angleDeg: number) {
  const oc = getOC();
  const pull = new oc.gp_Dir(input.pull[0], input.pull[1], input.pull[2]);
  const { plane, release } = occtPlane(input.frame);
  const progress = new oc.Message_ProgressRange();
  try {
    input.faces.forEach((index, position) => {
      if (!addFace(algorithm, input, index, draftAngleRad(angleDeg), { pull, plane })) {
        throw new DraftFaceError(draftFaceFailureMessage(position + 1, faceReason(input.topology, index, input.pull), angleDeg));
      }
    });
    algorithm.Build(progress);
    return algorithm.IsDone();
  } catch (error) {
    if (error instanceof DraftFaceError) throw error;
    return false;
  } finally {
    progress.delete();
    release();
    pull.delete();
  }
}

function plausibleResult(algorithm: BRepOffsetAPI_DraftAngle): Shape3D | null {
  const raw = algorithm.Shape();
  if (!isValidShape(raw)) {
    raw.delete();
    return null;
  }
  let result: Shape3D;
  try {
    result = shape3DOf(raw, "Уклон не дал твёрдого тела.");
  } catch {
    return null;
  }
  const volume = measureVolume(result);
  if (Number.isFinite(volume) && volume > 0) return result;
  result.delete();
  return null;
}

function buildDraft(input: DraftInput, angleDeg: number): BuiltDraft | null {
  const algorithm = new (getOC().BRepOffsetAPI_DraftAngle)(input.body.shape.wrapped);
  try {
    const result = runDraft(algorithm, input, angleDeg) ? plausibleResult(algorithm) : null;
    if (result) return { algorithm, result };
  } catch (error) {
    algorithm.delete();
    throw error;
  }
  algorithm.delete();
  return null;
}

function draftBuilds(input: DraftInput, angleDeg: number): boolean {
  try {
    const built = buildDraft(input, angleDeg);
    if (!built) return false;
    built.result.delete();
    built.algorithm.delete();
    return true;
  } catch {
    return false;
  }
}

function draftHistory(algorithm: BRepOffsetAPI_DraftAngle): HistoryAlgorithm {
  return {
    Modified: (shape) => {
      const modified = algorithm.Modified(shape);
      if (modified.Size() > 0) return modified;
      modified.delete();
      return algorithm.Generated(shape);
    },
    Generated: (shape) => algorithm.Generated(shape),
  };
}

export function namedDraft(body: NamedShape, feature: Omit<BrowserDraftFeature, "bodyId">, featureKey: string): NamedShape {
  const invalid = draftParamsError(feature);
  if (invalid) throw new Error(invalid);
  const faces = resolveNames(body.naming.faces, feature.faceNames, "грань");
  const frame = neutralFrame(body, feature.neutral);
  const pull = draftPullDirection(feature.neutral, frame.normal, feature.reverse);
  return withTopology(body.shape, (topology) => {
    const input: DraftInput = { body, topology, faces, frame, pull };
    const built = buildDraft(input, feature.angleDeg);
    if (!built) {
      const fits = largestWorkingRadius(feature.angleDeg, (angle) => draftBuilds(input, angle));
      throw new Error(draftFailureMessage(feature.angleDeg, fits));
    }
    try {
      return namedFromHistory({ algorithm: draftHistory(built.algorithm), inputs: [body], result: built.result, featureKey });
    } finally {
      built.algorithm.delete();
    }
  });
}

export function draftNamed(request: DraftRequest, lookup: BodyLookup): NamedShape {
  return namedDraft(lookup(request.bodyId), request, request.featureKey);
}
