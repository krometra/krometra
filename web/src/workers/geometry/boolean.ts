import { cast, getOC, isShape3D, measureVolume } from "replicad";
import type { Shape3D } from "replicad";
import type { TopoDS_Shape } from "replicad-opencascadejs";
import { assertNonEmptyBrowserBoolean, type BrowserBooleanOperation } from "@/lib/browserBoolean";
import { namedFromHistory, type NamedShape } from "./naming";
import type { BodyLookup, BooleanRequest } from "./types";

function onlySolid(shape: TopoDS_Shape): TopoDS_Shape {
  const oc = getOC();
  if (shape.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_COMPOUND) return shape;
  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try {
    const solids: TopoDS_Shape[] = [];
    for (; explorer.More(); explorer.Next()) solids.push(explorer.Current());
    if (solids.length !== 1) {
      solids.forEach((solid) => solid.delete());
      return shape;
    }
    shape.delete();
    return oc.TopoDS.Solid(solids[0]);
  } finally {
    explorer.delete();
  }
}

export function shape3DOf(raw: TopoDS_Shape, failure: string): Shape3D {
  const shape = cast(onlySolid(raw));
  if (!isShape3D(shape)) {
    shape.delete();
    throw new Error(failure);
  }
  return shape;
}

function booleanAlgorithm(operation: BrowserBooleanOperation, target: TopoDS_Shape, tool: TopoDS_Shape) {
  const oc = getOC();
  const progress = new oc.Message_ProgressRange();
  try {
    if (operation === "union") return new oc.BRepAlgoAPI_Fuse(target, tool, progress);
    if (operation === "subtract") return new oc.BRepAlgoAPI_Cut(target, tool, progress);
    return new oc.BRepAlgoAPI_Common(target, tool, progress);
  } finally {
    progress.delete();
  }
}

export function namedBoolean(
  target: NamedShape,
  tool: NamedShape,
  operation: BrowserBooleanOperation,
  featureKey: string,
): NamedShape {
  const algorithm = booleanAlgorithm(operation, target.shape.wrapped, tool.shape.wrapped);
  try {
    if (algorithm.HasErrors()) throw new Error("Браузерное ядро не смогло выполнить булеву операцию.");
    algorithm.SimplifyResult(true, true, 1e-3);
    const result = shape3DOf(algorithm.Shape(), "Результат булевой операции не является телом.");
    return namedFromHistory({ algorithm, inputs: [target, tool], result, featureKey });
  } finally {
    algorithm.delete();
  }
}

export function booleanNamed(request: BooleanRequest, lookup: BodyLookup): NamedShape {
  const result = namedBoolean(
    lookup(request.targetBodyId),
    lookup(request.toolBodyId),
    request.operation,
    request.featureKey,
  );
  try {
    assertNonEmptyBrowserBoolean(measureVolume(result.shape));
    return result;
  } catch (error) {
    result.shape.delete();
    throw error;
  }
}
