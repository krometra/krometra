import { Edge, getOC } from "replicad";
import type { Face, Vector } from "replicad";
import { globalAxisLine, isGlobalAxis, type PatternAxisRef, type PatternLine } from "@/lib/bodyPattern";
import type { Vec3 } from "@/lib/bodyTransform";
import { resolveNames } from "@/lib/browserNaming";
import { faceByName, withTopology, type NamedShape } from "./naming";
import { cylinderAxis } from "./thread";
import type { BodyLookup } from "./types";

function tupleOf(vector: Vector): Vec3 {
  try {
    return vector.toTuple() as Vec3;
  } finally {
    vector.delete();
  }
}

function edgeByName(named: NamedShape, name: string): Edge {
  const [index] = resolveNames(named.naming.edges, [name], "ребро");
  return withTopology(named.shape, (topology) => new Edge(getOC().TopoDS.Edge(topology.edges[index])));
}

function edgeLine(edge: Edge): PatternLine {
  if (edge.geomType !== "LINE") {
    throw new Error("Ось массива задаёт только прямое ребро: выберите прямолинейное ребро или цилиндрическую грань.");
  }
  const start = tupleOf(edge.startPoint);
  const end = tupleOf(edge.endPoint);
  return { origin: start, direction: [end[0] - start[0], end[1] - start[1], end[2] - start[2]] };
}

function faceLine(face: Face): PatternLine {
  if (face.geomType === "CYLINDRE") {
    const { origin, direction } = cylinderAxis(face);
    return { origin, direction };
  }
  if (face.geomType !== "PLANE") {
    throw new Error("Ось массива задаёт цилиндрическая грань (её ось) или плоская грань (её нормаль) — выберите другую грань.");
  }
  const center = face.center;
  try {
    return { origin: center.toTuple() as Vec3, direction: tupleOf(face.normalAt(center)) };
  } finally {
    center.delete();
  }
}

function withDisposed<S extends { delete(): void }, T>(shape: S, use: (shape: S) => T): T {
  try {
    return use(shape);
  } finally {
    shape.delete();
  }
}

export function resolveAxisLine(ref: PatternAxisRef, lookup: BodyLookup): PatternLine {
  if (isGlobalAxis(ref)) return globalAxisLine(ref.kind);
  if (ref.kind === "custom") return { origin: ref.origin, direction: ref.direction };
  const body = lookup(ref.bodyId);
  if (ref.kind === "edge") return withDisposed(edgeByName(body, ref.name), edgeLine);
  return withDisposed(faceByName(body, ref.name), faceLine);
}
