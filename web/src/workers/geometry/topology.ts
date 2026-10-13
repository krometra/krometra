import { getOC, HASH_CODE_MAX } from "replicad";
import type { NCollection_List_TopoDS_Shape, TopoDS_Shape } from "replicad-opencascadejs";
import type { Fingerprint, TopologySnapshot } from "@/lib/browserNaming";

export interface Topology {
  faces: TopoDS_Shape[];
  edges: TopoDS_Shape[];
  snapshot: TopologySnapshot;
  faceHashes: number[];
  edgeHashes: number[];
  faceIndex(shape: TopoDS_Shape): number;
  edgeIndex(shape: TopoDS_Shape): number;
  dispose(): void;
}

export function shapeHash(shape: TopoDS_Shape): number {
  return getOC().ReplicadShapeHasher.HashCode(shape, HASH_CODE_MAX);
}

class ShapeIndex {
  readonly shapes: TopoDS_Shape[] = [];
  readonly hashes: number[] = [];
  private buckets = new Map<number, number[]>();

  find(shape: TopoDS_Shape, hash = shapeHash(shape)): number {
    return (this.buckets.get(hash) ?? []).find((index) => this.shapes[index].IsSame(shape)) ?? -1;
  }

  add(shape: TopoDS_Shape): { index: number; added: boolean } {
    const hash = shapeHash(shape);
    const existing = this.find(shape, hash);
    if (existing >= 0) return { index: existing, added: false };
    const index = this.shapes.length;
    this.shapes.push(shape);
    this.hashes.push(hash);
    this.buckets.set(hash, [...(this.buckets.get(hash) ?? []), index]);
    return { index, added: true };
  }
}

function forEachSubshape(shape: TopoDS_Shape, kind: "face" | "edge", visit: (subshape: TopoDS_Shape) => void) {
  const oc = getOC();
  const type = kind === "face" ? oc.TopAbs_ShapeEnum.TopAbs_FACE : oc.TopAbs_ShapeEnum.TopAbs_EDGE;
  const explorer = new oc.TopExp_Explorer(shape, type, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try {
    for (; explorer.More(); explorer.Next()) visit(explorer.Current());
  } finally {
    explorer.delete();
  }
}

export function fingerprintOf(shape: TopoDS_Shape, kind: "face" | "edge"): Fingerprint {
  const oc = getOC();
  const props = new oc.GProp_GProps();
  try {
    if (kind === "face") oc.BRepGProp.SurfaceProperties(shape, props, false, false);
    else oc.BRepGProp.LinearProperties(shape, props, false, false);
    const centre = props.CentreOfMass();
    const fingerprint: Fingerprint = [centre.X(), centre.Y(), centre.Z(), props.Mass()];
    centre.delete();
    return fingerprint;
  } finally {
    props.delete();
  }
}

export function readTopology(shape: TopoDS_Shape): Topology {
  const faces = new ShapeIndex();
  const edges = new ShapeIndex();
  const edgeFaces: number[][] = [];
  const duplicates: TopoDS_Shape[] = [];
  forEachSubshape(shape, "face", (face) => {
    const { index: faceIndex, added } = faces.add(face);
    if (!added) {
      duplicates.push(face);
      return;
    }
    forEachSubshape(face, "edge", (edge) => {
      const { index, added: edgeAdded } = edges.add(edge);
      if (!edgeAdded) duplicates.push(edge);
      edgeFaces[index] = [...(edgeFaces[index] ?? []), faceIndex];
    });
  });
  forEachSubshape(shape, "edge", (edge) => {
    const { index, added } = edges.add(edge);
    if (!added) duplicates.push(edge);
    else edgeFaces[index] = [];
  });
  duplicates.forEach((duplicate) => duplicate.delete());
  return {
    faces: faces.shapes,
    edges: edges.shapes,
    faceHashes: faces.hashes,
    edgeHashes: edges.hashes,
    snapshot: {
      faces: faces.shapes.map((face) => fingerprintOf(face, "face")),
      edges: edges.shapes.map((edge, index) => ({ faces: edgeFaces[index] ?? [], fingerprint: fingerprintOf(edge, "edge") })),
    },
    faceIndex: (candidate) => faces.find(candidate),
    edgeIndex: (candidate) => edges.find(candidate),
    dispose: () => [...faces.shapes, ...edges.shapes].forEach((subshape) => subshape.delete()),
  };
}

export function listShapes(list: NCollection_List_TopoDS_Shape): TopoDS_Shape[] {
  const copy = new (getOC().NCollection_List_TopoDS_Shape)(list);
  const shapes: TopoDS_Shape[] = [];
  try {
    while (copy.Size() > 0) {
      shapes.push(copy.First());
      copy.RemoveFirst();
    }
    return shapes;
  } finally {
    copy.delete();
    list.delete();
  }
}
