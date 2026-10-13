import { cast, getOC, isShape3D } from "replicad";
import type { Shape3D } from "replicad";
import type { TopoDS_Shape } from "replicad-opencascadejs";
import {
  IMPORT_EMPTY_FILE,
  IMPORT_NO_BODIES,
  IMPORT_SURFACES_ONLY,
  IMPORT_UNREADABLE,
  importBodyCountError,
} from "@/lib/browserImport";
import { namedFromGeometry } from "./naming";
import { initOcct } from "./occt";
import { publishShape, releaseShape } from "./shapes";

export interface ImportStepRequest {
  id: number;
  kind: "import-step";
  file: ArrayBuffer;
  existingBodies: number;
}

let nextImportFile = 1;

function transferredRoots(path: string): TopoDS_Shape {
  const oc = getOC();
  const reader = new oc.STEPControl_Reader();
  try {
    if (reader.ReadFile(path) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error(IMPORT_UNREADABLE);
    reader.TransferRoots();
    const roots = reader.OneShape();
    if (!roots.IsNull()) return roots;
    roots.delete();
    throw new Error(IMPORT_NO_BODIES);
  } catch (error) {
    throw error instanceof Error ? error : new Error(IMPORT_UNREADABLE);
  } finally {
    reader.delete();
  }
}

function readStep(file: ArrayBuffer): TopoDS_Shape {
  const oc = getOC();
  const path = `/import-${nextImportFile++}.step`;
  oc.FS.writeFile(path, new Uint8Array(file));
  try {
    return transferredRoots(path);
  } finally {
    oc.FS.unlink(path);
  }
}

function subshapes(shape: TopoDS_Shape, find: "solid" | "face", avoid: "solid" | "shape"): TopoDS_Shape[] {
  const oc = getOC();
  const kinds = {
    solid: oc.TopAbs_ShapeEnum.TopAbs_SOLID,
    face: oc.TopAbs_ShapeEnum.TopAbs_FACE,
    shape: oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  };
  const explorer = new oc.TopExp_Explorer(shape, kinds[find], kinds[avoid]);
  const found: TopoDS_Shape[] = [];
  try {
    for (; explorer.More(); explorer.Next()) found.push(explorer.Current());
    return found;
  } finally {
    explorer.delete();
  }
}

function hasFreeFaces(roots: TopoDS_Shape): boolean {
  const faces = subshapes(roots, "face", "solid");
  faces.forEach((face) => face.delete());
  return faces.length > 0;
}

function solidBody(solid: TopoDS_Shape): Shape3D {
  const body = cast(solid);
  if (isShape3D(body)) return body;
  body.delete();
  throw new Error(IMPORT_NO_BODIES);
}

function importedSolids(file: ArrayBuffer, existingBodies: number): Shape3D[] {
  const roots = readStep(file);
  const solids = subshapes(roots, "solid", "shape");
  try {
    if (solids.length === 0) throw new Error(hasFreeFaces(roots) ? IMPORT_SURFACES_ONLY : IMPORT_NO_BODIES);
    const limit = importBodyCountError(solids.length, existingBodies);
    if (limit) throw new Error(limit);
    return solids.map(solidBody);
  } finally {
    solids.forEach((solid) => solid.delete());
    roots.delete();
  }
}

export async function importStepBodies(request: ImportStepRequest) {
  if (request.file.byteLength === 0) throw new Error(IMPORT_EMPTY_FILE);
  await initOcct();
  const startedAt = performance.now();
  const solids = importedSolids(request.file, request.existingBodies);
  const imported: Awaited<ReturnType<typeof publishShape>>[] = [];
  try {
    while (solids.length > 0) {
      imported.push(await publishShape(namedFromGeometry(solids[0]), startedAt));
      solids.shift();
    }
  } catch (error) {
    solids.forEach((solid) => solid.delete());
    imported.forEach((body) => releaseShape(body.shapeHandle));
    throw error;
  }
  return { imported };
}
