import { browserMeshData, type BrowserMeshNames } from "@/lib/browserMesh";
import { saveNaming, type SavedNaming } from "@/lib/browserNaming";
import type { MeshData } from "@/types/api";
import { withTopology, type NamedShape } from "./naming";

const MESH_OPTIONS = { tolerance: 0.01, angularTolerance: 0.5 };

function meshNames(named: NamedShape, faceHashes: number[], edgeHashes: number[], edgeFaces: number[][]): BrowserMeshNames {
  const faceEdges = new Map<string, string[]>();
  edgeFaces.forEach((faces, edge) => {
    for (const face of new Set(faces)) {
      const faceName = named.naming.faces[face];
      faceEdges.set(faceName, [...(faceEdges.get(faceName) ?? []), named.naming.edges[edge]]);
    }
  });
  return {
    faces: new Map(faceHashes.map((hash, index) => [hash, named.naming.faces[index]])),
    edges: new Map(edgeHashes.map((hash, index) => [hash, named.naming.edges[index]])),
    faceEdges,
  };
}

export function publishedBody(named: NamedShape): { mesh: MeshData; naming: SavedNaming } {
  return withTopology(named.shape, (topology) => {
    const names = meshNames(
      named,
      topology.faceHashes,
      topology.edgeHashes,
      topology.snapshot.edges.map((edge) => edge.faces),
    );
    const mesh = browserMeshData(named.shape.mesh(MESH_OPTIONS), named.shape.meshEdges(MESH_OPTIONS), names);
    return { mesh, naming: saveNaming(topology.snapshot, named.naming) };
  });
}
