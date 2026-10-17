import { getOC } from "replicad";
import {
  areParallel,
  patternError,
  patternTransforms,
  usesSecondDirection,
  type PatternLines,
  type PatternMode,
  type PatternSpec,
} from "@/lib/bodyPattern";
import type { BodyTransform } from "@/lib/bodyTransform";
import { generatedFaceName } from "@/lib/browserNaming";
import { shape3DOf, shapeList } from "./boolean";
import { namedFromHistory, type NamedShape } from "./naming";
import { resolveAxisLine } from "./patternAxis";
import { movement } from "./transform";
import type { BodyLookup } from "./types";

export interface PatternRequest {
  id: number;
  kind: "pattern";
  bodyId: string;
  featureKey: string;
  pattern: PatternSpec;
  mode: PatternMode;
  instance: number | null;
}

function patternLines(spec: PatternSpec, lookup: BodyLookup): PatternLines {
  const axis = resolveAxisLine(spec.axis, lookup);
  const axis2 = usesSecondDirection(spec) ? resolveAxisLine(spec.axis2, lookup) : null;
  if (axis2 && areParallel(axis.direction, axis2.direction)) {
    throw new Error("Второе направление массива параллельно первому — выберите другое.");
  }
  return { axis, axis2 };
}

function instanceNames(source: NamedShape, featureKey: string, instance: number): NamedShape {
  const faces = source.naming.faces.map((name) => generatedFaceName(featureKey, `${instance}/${name}`));
  return { shape: source.shape, naming: { faces, edges: [] } };
}

function placedInstance(source: NamedShape, transform: BodyTransform, featureKey: string, instance: number): NamedShape {
  const oc = getOC();
  const trsf = movement(transform);
  const algorithm = new oc.BRepBuilderAPI_Transform(source.shape.wrapped, trsf, true, false);
  try {
    if (!algorithm.IsDone()) throw new Error("Браузерное ядро не смогло разместить экземпляр массива.");
    const result = shape3DOf(algorithm.Shape(), "Экземпляр массива не является телом.");
    return namedFromHistory({ algorithm, inputs: [instanceNames(source, featureKey, instance)], result, featureKey });
  } finally {
    algorithm.delete();
    trsf.delete();
  }
}

function fusedInstances(source: NamedShape, copies: NamedShape[], featureKey: string): NamedShape {
  const oc = getOC();
  const algorithm = new oc.BRepAlgoAPI_Fuse();
  const objects = shapeList([source]);
  const tools = shapeList(copies);
  const progress = new oc.Message_ProgressRange();
  try {
    algorithm.SetArguments(objects);
    algorithm.SetTools(tools);
    algorithm.Build(progress);
    if (algorithm.HasErrors()) throw new Error("Браузерное ядро не смогло объединить экземпляры массива.");
    algorithm.SimplifyResult(true, true, 1e-3);
    const result = shape3DOf(algorithm.Shape(), "Результат массива не является телом.");
    return namedFromHistory({ algorithm, inputs: [source, ...copies], result, featureKey });
  } finally {
    progress.delete();
    tools.delete();
    objects.delete();
    algorithm.delete();
  }
}

function separateInstance(source: NamedShape, transforms: BodyTransform[], request: PatternRequest): NamedShape {
  const instance = request.instance ?? 0;
  if (!Number.isInteger(instance) || instance < 1 || instance > transforms.length) {
    throw new Error("Экземпляр массива вне диапазона: пересоберите массив заново.");
  }
  return placedInstance(source, transforms[instance - 1], request.featureKey, instance);
}

function joinedInstances(source: NamedShape, transforms: BodyTransform[], featureKey: string): NamedShape {
  const copies: NamedShape[] = [];
  try {
    transforms.forEach((transform, index) => copies.push(placedInstance(source, transform, featureKey, index + 1)));
    return fusedInstances(source, copies, featureKey);
  } finally {
    copies.forEach((copy) => copy.shape.delete());
  }
}

export function patternNamed(request: PatternRequest, lookup: BodyLookup): NamedShape {
  const error = patternError(request.pattern, request.mode);
  if (error) throw new Error(error);
  const source = lookup(request.bodyId);
  const transforms = patternTransforms(request.pattern, patternLines(request.pattern, lookup));
  return request.mode === "separate"
    ? separateInstance(source, transforms, request)
    : joinedInstances(source, transforms, request.featureKey);
}
