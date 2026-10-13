import { getOC } from "replicad";
import type { BRepFilletAPI_MakeChamfer, BRepFilletAPI_MakeFillet, TopoDS_Shape } from "replicad-opencascadejs";
import { filletFailureMessage, largestWorkingRadius } from "@/lib/filletFailure";
import { resolveNames } from "@/lib/browserNaming";
import { shape3DOf } from "./boolean";
import { generatedFaces, namedFromHistory, withTopology, type NamedShape } from "./naming";
import type { Topology } from "./topology";
import type { BodyLookup, EdgeFeatureRequest } from "./types";

export type EdgeFeature =
  | { kind: "fillet"; edgeNames: string[]; radius: number }
  | { kind: "chamfer"; edgeNames: string[]; distance1: number; distance2: number };

function assertPositive(feature: EdgeFeature) {
  const sizes = feature.kind === "fillet" ? [feature.radius] : [feature.distance1, feature.distance2];
  if (sizes.some((size) => !Number.isFinite(size) || size <= 0)) {
    throw new Error(feature.kind === "fillet" ? "Радиус скругления должен быть больше нуля." : "Размеры фаски должны быть больше нуля.");
  }
  if (feature.edgeNames.length === 0) throw new Error("Выберите хотя бы одно ребро.");
}

function edgeAlgorithm(feature: EdgeFeature, body: NamedShape, topology: Topology, edges: number[]) {
  const oc = getOC();
  if (feature.kind === "fillet") {
    const fillet = new oc.BRepFilletAPI_MakeFillet(body.shape.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational);
    edges.forEach((edge) => {
      const shape = oc.TopoDS.Edge(topology.edges[edge]);
      fillet.Add(feature.radius, shape);
      shape.delete();
    });
    return fillet;
  }
  const chamfer = new oc.BRepFilletAPI_MakeChamfer(body.shape.wrapped);
  edges.forEach((edge) => {
    const shape = oc.TopoDS.Edge(topology.edges[edge]);
    const face = topology.snapshot.edges[edge].faces[0];
    if (Math.abs(feature.distance1 - feature.distance2) < 1e-9 || face === undefined) {
      chamfer.Add(feature.distance1, shape);
    } else {
      const side = oc.TopoDS.Face(topology.faces[face]);
      chamfer.Add(feature.distance1, feature.distance2, shape, side);
      side.delete();
    }
    shape.delete();
  });
  return chamfer;
}

type EdgeAlgorithm = BRepFilletAPI_MakeFillet | BRepFilletAPI_MakeChamfer;

function built(algorithm: EdgeAlgorithm): boolean {
  const progress = new (getOC().Message_ProgressRange)();
  try {
    algorithm.Build(progress);
    return algorithm.IsDone();
  } catch {
    return false;
  } finally {
    progress.delete();
  }
}

function isValidShape(shape: TopoDS_Shape): boolean {
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape, true, false, false);
  try {
    return analyzer.IsValid();
  } catch {
    return false;
  } finally {
    analyzer.delete();
  }
}

function builtShape(algorithm: EdgeAlgorithm, feature: EdgeFeature): TopoDS_Shape | null {
  if (!built(algorithm)) return null;
  const shape = algorithm.Shape();
  if (feature.kind === "chamfer" || isValidShape(shape)) return shape;
  shape.delete();
  return null;
}

function filletBuilds(body: NamedShape, topology: Topology, edges: number[], radius: number): boolean {
  const algorithm = edgeAlgorithm({ kind: "fillet", edgeNames: [], radius }, body, topology, edges);
  try {
    const shape = builtShape(algorithm, { kind: "fillet", edgeNames: [], radius });
    shape?.delete();
    return shape !== null;
  } finally {
    algorithm.delete();
  }
}

function failureMessage(feature: EdgeFeature, body: NamedShape, topology: Topology, edges: number[]): string {
  if (feature.kind === "chamfer") return "Не удалось построить фаску: уменьшите размер или выберите другие рёбра.";
  const fits = largestWorkingRadius(feature.radius, (radius) => filletBuilds(body, topology, edges, radius));
  return filletFailureMessage(feature.radius, edges.length, fits);
}

export function namedEdgeFeature(body: NamedShape, feature: EdgeFeature, featureKey: string): NamedShape {
  assertPositive(feature);
  const edges = resolveNames(body.naming.edges, feature.edgeNames, "ребро");
  return withTopology(body.shape, (topology) => {
    const algorithm = edgeAlgorithm(feature, body, topology, edges);
    try {
      const shape = builtShape(algorithm, feature);
      if (!shape) throw new Error(failureMessage(feature, body, topology, edges));
      const result = shape3DOf(shape, feature.kind === "fillet" ? "Скругление не дало твёрдого тела." : "Фаска не дала твёрдого тела.");
      return namedFromHistory({
        algorithm,
        inputs: [body],
        result,
        featureKey,
        generated: (resultTopology, [input]) => generatedFaces(
          algorithm,
          edges.map((edge) => ({ key: `${feature.kind}:${body.naming.edges[edge]}`, shape: input.edges[edge] })),
          resultTopology,
        ),
      });
    } finally {
      algorithm.delete();
    }
  });
}

export function edgeFeatureNamed(request: EdgeFeatureRequest, lookup: BodyLookup): NamedShape {
  return namedEdgeFeature(lookup(request.bodyId), request, request.featureKey);
}
