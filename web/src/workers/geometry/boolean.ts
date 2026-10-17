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

export function shapeList(shapes: NamedShape[]) {
  const list = new (getOC().NCollection_List_TopoDS_Shape)();
  shapes.forEach((named) => list.Append(named.shape.wrapped));
  return list;
}

function booleanAlgorithm(operation: BrowserBooleanOperation) {
  const oc = getOC();
  if (operation === "union") return new oc.BRepAlgoAPI_Fuse();
  if (operation === "subtract") return new oc.BRepAlgoAPI_Cut();
  return new oc.BRepAlgoAPI_Common();
}

function namedBooleanOfAll(
  target: NamedShape,
  tools: NamedShape[],
  operation: BrowserBooleanOperation,
  featureKey: string,
): NamedShape {
  const oc = getOC();
  const algorithm = booleanAlgorithm(operation);
  const objects = shapeList([target]);
  const toolList = shapeList(tools);
  const progress = new oc.Message_ProgressRange();
  try {
    algorithm.SetArguments(objects);
    algorithm.SetTools(toolList);
    algorithm.Build(progress);
    if (algorithm.HasErrors()) throw new Error("Браузерное ядро не смогло выполнить булеву операцию.");
    algorithm.SimplifyResult(true, true, 1e-3);
    const result = shape3DOf(algorithm.Shape(), "Результат булевой операции не является телом.");
    return namedFromHistory({ algorithm, inputs: [target, ...tools], result, featureKey });
  } finally {
    progress.delete();
    toolList.delete();
    objects.delete();
    algorithm.delete();
  }
}

export function namedBoolean(
  target: NamedShape,
  tool: NamedShape,
  operation: BrowserBooleanOperation,
  featureKey: string,
): NamedShape {
  return namedBooleanOfAll(target, [tool], operation, featureKey);
}

function commonOfAll(target: NamedShape, tools: NamedShape[], featureKey: string): NamedShape {
  let current = target;
  try {
    for (const tool of tools) {
      const next = namedBoolean(current, tool, "intersect", featureKey);
      if (current !== target) current.shape.delete();
      current = next;
    }
    return current;
  } catch (error) {
    if (current !== target) current.shape.delete();
    throw error;
  }
}

export function combineBodies(
  target: NamedShape,
  tools: NamedShape[],
  operation: BrowserBooleanOperation,
  featureKey: string,
): NamedShape {
  if (tools.length === 0) throw new Error("Выберите хотя бы одно тело-инструмент.");
  return operation === "intersect" ? commonOfAll(target, tools, featureKey) : namedBooleanOfAll(target, tools, operation, featureKey);
}

export function booleanNamed(request: BooleanRequest, lookup: BodyLookup): NamedShape {
  const result = combineBodies(
    lookup(request.targetBodyId),
    request.toolBodyIds.map((bodyId) => lookup(bodyId)),
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
