import { getOC, measureVolume } from "replicad";
import type { Shape3D } from "replicad";
import type { BRepOffsetAPI_MakeThickSolid, TopoDS_Shape } from "replicad-opencascadejs";
import { resolveNames } from "@/lib/browserNaming";
import {
  shellFailureMessage,
  shellOffset,
  shellParamsError,
  shellVolumeFits,
  wallMatchesThickness,
  type BrowserShellFeature,
} from "@/lib/browserShell";
import { largestWorkingRadius } from "@/lib/filletFailure";
import { shape3DOf } from "./boolean";
import { isValidShape } from "./edgeOps";
import { generatedFaces, namedFromHistory, withTopology, type NamedShape } from "./naming";
import { listShapes, type Topology } from "./topology";
import type { BodyLookup } from "./types";

export interface ShellRequest extends BrowserShellFeature {
  id: number;
  kind: "shell";
  featureKey: string;
}

type ShellJoin = "GeomAbs_Intersection" | "GeomAbs_Arc";

interface ShellInput {
  body: NamedShape;
  topology: Topology;
  openFaces: number[];
  thickness: number;
  direction: BrowserShellFeature["direction"];
}

interface BuiltShell {
  algorithm: BRepOffsetAPI_MakeThickSolid;
  result: Shape3D;
}

const JOINS: ShellJoin[] = ["GeomAbs_Intersection", "GeomAbs_Arc"];
const OFFSET_TOLERANCE = 1e-3;

function runThickSolid(algorithm: BRepOffsetAPI_MakeThickSolid, input: ShellInput, join: ShellJoin): boolean {
  const oc = getOC();
  const closing = new oc.NCollection_List_TopoDS_Shape();
  const progress = new oc.Message_ProgressRange();
  try {
    input.openFaces.forEach((face) => closing.Append(input.topology.faces[face]));
    algorithm.MakeThickSolidByJoin(
      input.body.shape.wrapped,
      closing,
      shellOffset(input.thickness, input.direction),
      OFFSET_TOLERANCE,
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      oc.GeomAbs_JoinType[join],
      false,
      progress,
    );
    return algorithm.IsDone();
  } catch {
    return false;
  } finally {
    closing.delete();
    progress.delete();
  }
}

function distanceBetween(a: TopoDS_Shape, b: TopoDS_Shape): number {
  const distance = new (getOC().BRepExtrema_DistShapeShape)(a, b);
  try {
    return distance.IsDone() ? distance.Value() : Number.NaN;
  } finally {
    distance.delete();
  }
}

function wallsKeepThickness(algorithm: BRepOffsetAPI_MakeThickSolid, input: ShellInput): boolean {
  const open = new Set(input.openFaces);
  let walls = 0;
  let consistent = true;
  input.topology.faces.forEach((face, index) => {
    if (open.has(index)) return;
    for (const wall of listShapes(algorithm.Generated(face))) {
      walls++;
      if (consistent && !wallMatchesThickness(distanceBetween(face, wall), input.thickness)) consistent = false;
      wall.delete();
    }
  });
  return consistent && walls > 0;
}

function plausibleResult(algorithm: BRepOffsetAPI_MakeThickSolid, input: ShellInput): Shape3D | null {
  const raw = algorithm.Shape();
  if (!isValidShape(raw)) {
    raw.delete();
    return null;
  }
  let result: Shape3D;
  try {
    result = shape3DOf(raw, "Оболочка не дала твёрдого тела.");
  } catch {
    return null;
  }
  if (shellVolumeFits(measureVolume(input.body.shape), measureVolume(result), input.direction) && wallsKeepThickness(algorithm, input)) {
    return result;
  }
  result.delete();
  return null;
}

function buildShell(input: ShellInput, join: ShellJoin): BuiltShell | null {
  const algorithm = new (getOC().BRepOffsetAPI_MakeThickSolid)();
  const result = runThickSolid(algorithm, input, join) ? plausibleResult(algorithm, input) : null;
  if (result) return { algorithm, result };
  algorithm.delete();
  return null;
}

function firstWorkingShell(input: ShellInput): BuiltShell | null {
  for (const join of JOINS) {
    const built = buildShell(input, join);
    if (built) return built;
  }
  return null;
}

function shellBuilds(input: ShellInput, thickness: number): boolean {
  const built = firstWorkingShell({ ...input, thickness });
  if (!built) return false;
  built.result.delete();
  built.algorithm.delete();
  return true;
}

function failureMessage(input: ShellInput): string {
  const fits = largestWorkingRadius(input.thickness, (thickness) => shellBuilds(input, thickness));
  return shellFailureMessage(input.thickness, input.direction, fits);
}

function namedResult(input: ShellInput, built: BuiltShell, featureKey: string): NamedShape {
  const open = new Set(input.openFaces);
  const { naming } = input.body;
  return namedFromHistory({
    algorithm: built.algorithm,
    inputs: [input.body],
    result: built.result,
    featureKey,
    generated: (resultTopology, [source]) => generatedFaces(
      built.algorithm,
      [
        ...source.faces
          .map((shape, index) => ({ key: `shell:${naming.faces[index]}`, shape, index }))
          .filter(({ index }) => !open.has(index)),
        ...source.edges.map((shape, index) => ({ key: `shell:${naming.edges[index]}`, shape })),
      ],
      resultTopology,
    ),
  });
}

export function namedShell(body: NamedShape, feature: Omit<BrowserShellFeature, "bodyId">, featureKey: string): NamedShape {
  const invalid = shellParamsError(feature);
  if (invalid) throw new Error(invalid);
  const openFaces = resolveNames(body.naming.faces, feature.faceNames, "грань");
  return withTopology(body.shape, (topology) => {
    const input: ShellInput = { body, topology, openFaces, thickness: feature.thickness, direction: feature.direction };
    const built = firstWorkingShell(input);
    if (!built) throw new Error(failureMessage(input));
    try {
      return namedResult(input, built, featureKey);
    } finally {
      built.algorithm.delete();
    }
  });
}

export function shellNamed(request: ShellRequest, lookup: BodyLookup): NamedShape {
  return namedShell(lookup(request.bodyId), request, request.featureKey);
}
