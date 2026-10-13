import { Edge, getOC } from "replicad";
import type { FilletEdgeSource } from "@/lib/browserFilletRun";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import { resolveNames } from "@/lib/browserNaming";
import { namedEdgeFeature } from "./edgeOps";
import { touches, withTopology, type NamedShape } from "./naming";
import { publishNamed } from "./shapes";
import type { BodyLookup } from "./types";

export interface FilletMergeRequest {
  id: number;
  kind: "fillet-merge";
  parentBodyId: string;
  sources: FilletEdgeSource[];
  radius: number;
  featureKey: string;
}

const SAMPLE_POSITIONS = [0.25, 0.5, 0.75];

function edgeSamples(body: NamedShape, edgeName: string): Vector3[] {
  const [index] = resolveNames(body.naming.edges, [edgeName], "ребро");
  return withTopology(body.shape, (topology) => {
    const edge = new Edge(getOC().TopoDS.Edge(topology.edges[index]));
    try {
      return SAMPLE_POSITIONS.map((position) => {
        const point = edge.pointAt(position);
        try {
          return point.toTuple() as Vector3;
        } finally {
          point.delete();
        }
      });
    } finally {
      edge.delete();
    }
  });
}

function parentEdgeByGeometry(parent: NamedShape, source: NamedShape, edgeName: string): string {
  const samples = edgeSamples(source, edgeName);
  const matches = withTopology(parent.shape, (topology) => topology.edges
    .map((edge, index) => (samples.every((point) => touches(edge, point)) ? index : -1))
    .filter((index) => index >= 0));
  if (matches.length !== 1) throw new Error(`Ребро «${edgeName}» не нашлось на исходном теле скругления.`);
  return parent.naming.edges[matches[0]];
}

export function parentEdgeNames(parent: NamedShape, sources: FilletEdgeSource[], lookup: BodyLookup): string[] {
  const known = new Set(parent.naming.edges);
  const names: string[] = [];
  for (const source of sources) {
    for (const edgeName of source.edgeNames) {
      const name = known.has(edgeName) ? edgeName : parentEdgeByGeometry(parent, lookup(source.bodyId), edgeName);
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

export async function runFilletMerge(request: FilletMergeRequest, lookup: BodyLookup) {
  let edgeNames: string[] = [];
  const result = await publishNamed(() => {
    const parent = lookup(request.parentBodyId);
    edgeNames = parentEdgeNames(parent, request.sources, lookup);
    return namedEdgeFeature(parent, { kind: "fillet", edgeNames, radius: request.radius }, request.featureKey);
  });
  return { ...result, edgeNames };
}
