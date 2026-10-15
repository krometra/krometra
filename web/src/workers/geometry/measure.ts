import {
  Edge,
  Face,
  getOC,
  measureShapeLinearProperties,
  measureShapeSurfaceProperties,
  measureShapeVolumeProperties,
} from "replicad";
import type { Shape3D } from "replicad";
import type { gp_Pnt, TopoDS_Shape } from "replicad-opencascadejs";
import { resolveNames } from "@/lib/browserNaming";
import {
  measuredPair,
  type MeasuredBody,
  type MeasuredEdge,
  type MeasuredFace,
  type MeasuredItem,
  type MeasuredVertex,
  type MeasureRef,
  type MeasureResult,
  type SurfaceKind,
} from "@/lib/measure";
import type { Vec3 } from "@/lib/threadGeometry";
import { unit } from "@/lib/vec3";
import { withTopology, type NamedShape } from "./naming";
import { initOcct } from "./occt";
import type { BodyLookup } from "./types";

export interface MeasureRequest {
  id: number;
  kind: "measure";
  refs: MeasureRef[];
}

const VERTEX_SNAP = 1e-2;
const CLOSED_GAP = 1e-7;

const SURFACES: Partial<Record<string, SurfaceKind>> = {
  PLANE: "plane",
  CYLINDRE: "cylinder",
  CONE: "cone",
  SPHERE: "sphere",
  TORUS: "torus",
};

function tupleOf(point: gp_Pnt): Vec3 {
  try {
    return [point.X(), point.Y(), point.Z()];
  } finally {
    point.delete();
  }
}

function vertexPoints(shape: TopoDS_Shape): Vec3[] {
  const oc = getOC();
  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const points: Vec3[] = [];
  try {
    for (; explorer.More(); explorer.Next()) {
      const vertex = oc.TopoDS.Vertex(explorer.Current());
      points.push(tupleOf(oc.BRep_Tool.Pnt(vertex)));
      vertex.delete();
    }
    return points;
  } finally {
    explorer.delete();
  }
}

export function snapToVertex(shape: TopoDS_Shape, point: Vec3): Vec3 {
  const gap = (candidate: Vec3) => Math.hypot(candidate[0] - point[0], candidate[1] - point[1], candidate[2] - point[2]);
  const nearest = vertexPoints(shape).reduce<Vec3 | null>((best, candidate) => (
    gap(candidate) <= VERTEX_SNAP && (!best || gap(candidate) < gap(best)) ? candidate : best
  ), null);
  return nearest ?? point;
}

function withVertex<T>(point: Vec3, use: (shape: TopoDS_Shape) => T): T {
  const oc = getOC();
  const pnt = new oc.gp_Pnt(point[0], point[1], point[2]);
  const maker = new oc.BRepBuilderAPI_MakeVertex(pnt);
  const vertex = maker.Vertex();
  try {
    return use(vertex);
  } finally {
    vertex.delete();
    maker.delete();
    pnt.delete();
  }
}

function withSubshape<T>(named: NamedShape, ref: MeasureRef & { kind: "edge" | "face" }, use: (shape: TopoDS_Shape) => T): T {
  const [index] = ref.kind === "face"
    ? resolveNames(named.naming.faces, [ref.faceId], "грань")
    : resolveNames(named.naming.edges, [ref.edgeId], "ребро");
  return withTopology(named.shape, (topology) => use(ref.kind === "face" ? topology.faces[index] : topology.edges[index]));
}

function withRefShape<T>(ref: MeasureRef, lookup: BodyLookup, use: (shape: TopoDS_Shape) => T): T {
  const named = lookup(ref.bodyId);
  if (ref.kind === "body") return use(named.shape.wrapped);
  if (ref.kind === "vertex") return withVertex(snapToVertex(named.shape.wrapped, ref.point), use);
  return withSubshape(named, ref, use);
}

function measureVertex(shape: TopoDS_Shape): MeasuredVertex {
  const oc = getOC();
  const vertex = oc.TopoDS.Vertex(shape);
  try {
    return { kind: "vertex", point: tupleOf(oc.BRep_Tool.Pnt(vertex)) };
  } finally {
    vertex.delete();
  }
}

function circleOf(edge: Edge) {
  const adaptor = new (getOC().BRepAdaptor_Curve)(edge.wrapped);
  try {
    const circle = adaptor.Circle();
    const axis = circle.Axis();
    const center = tupleOf(circle.Location());
    const direction = axis.Direction();
    const result = { radius: circle.Radius(), center, axis: { origin: center, direction: [direction.X(), direction.Y(), direction.Z()] as Vec3 } };
    direction.delete();
    axis.delete();
    circle.delete();
    return result;
  } finally {
    adaptor.delete();
  }
}

function vectorTuple(vector: { toTuple(): number[]; delete(): void }): Vec3 {
  try {
    return vector.toTuple() as Vec3;
  } finally {
    vector.delete();
  }
}

function measureEdge(shape: TopoDS_Shape): MeasuredEdge {
  const edge = new Edge(getOC().TopoDS.Edge(shape));
  const properties = measureShapeLinearProperties(edge);
  try {
    const start = vectorTuple(edge.startPoint);
    const end = vectorTuple(edge.endPoint);
    const length = properties.length;
    const closed = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) < CLOSED_GAP;
    const base: MeasuredEdge = { kind: "edge", curve: "other", length, start, end, closed, direction: null, radius: null, center: null, axis: null };
    if (edge.geomType === "LINE") {
      return { ...base, curve: "line", direction: [(end[0] - start[0]) / length, (end[1] - start[1]) / length, (end[2] - start[2]) / length] };
    }
    return edge.geomType === "CIRCLE" ? { ...base, curve: "circle", ...circleOf(edge) } : base;
  } finally {
    properties.delete();
    edge.delete();
  }
}

function curvedSurface(face: Face, surface: SurfaceKind): Pick<MeasuredFace, "radius" | "center" | "axis"> {
  const none = { radius: null, center: null, axis: null };
  if (surface !== "cylinder" && surface !== "sphere") return none;
  const adaptor = new (getOC().BRepAdaptor_Surface)(face.wrapped, false);
  try {
    if (surface === "sphere") {
      const sphere = adaptor.Sphere();
      const result = { ...none, radius: sphere.Radius(), center: tupleOf(sphere.Location()) };
      sphere.delete();
      return result;
    }
    const cylinder = adaptor.Cylinder();
    const axis = cylinder.Axis();
    const direction = axis.Direction();
    const origin = tupleOf(axis.Location());
    const result = { ...none, radius: cylinder.Radius(), axis: { origin, direction: [direction.X(), direction.Y(), direction.Z()] as Vec3 } };
    direction.delete();
    axis.delete();
    cylinder.delete();
    return result;
  } finally {
    adaptor.delete();
  }
}

function measureFace(shape: TopoDS_Shape): MeasuredFace {
  const face = new Face(getOC().TopoDS.Face(shape));
  const properties = measureShapeSurfaceProperties(face);
  try {
    const surface = SURFACES[face.geomType] ?? "other";
    const centroid = properties.centerOfMass;
    const normal = surface === "plane" ? unit(vectorTuple(face.normalAt())) : null;
    return { kind: "face", surface, area: properties.area, centroid, normal, ...curvedSurface(face, surface) };
  } finally {
    properties.delete();
    face.delete();
  }
}

function measureBody(shape: Shape3D): MeasuredBody {
  const volume = measureShapeVolumeProperties(shape);
  const surface = measureShapeSurfaceProperties(shape);
  const bounds = shape.boundingBox;
  try {
    const [min, max] = bounds.bounds as [Vec3, Vec3];
    return { kind: "body", volume: volume.volume, area: surface.area, centerOfMass: volume.centerOfMass, bbox: { min: [...min], max: [...max] } };
  } finally {
    bounds.delete();
    surface.delete();
    volume.delete();
  }
}

function measureRef(ref: MeasureRef, lookup: BodyLookup): MeasuredItem {
  if (ref.kind === "body") return measureBody(lookup(ref.bodyId).shape);
  return withRefShape(ref, lookup, (shape) => {
    if (ref.kind === "vertex") return measureVertex(shape);
    return ref.kind === "edge" ? measureEdge(shape) : measureFace(shape);
  });
}

export function minimumDistance(first: TopoDS_Shape, second: TopoDS_Shape): { distance: number; points: [Vec3, Vec3] } {
  const tool = new (getOC().BRepExtrema_DistShapeShape)(first, second);
  try {
    if (!tool.IsDone() || tool.NbSolution() < 1) throw new Error("Браузерное ядро не смогло найти расстояние между объектами.");
    return { distance: tool.Value(), points: [tupleOf(tool.PointOnShape1(1)), tupleOf(tool.PointOnShape2(1))] };
  } finally {
    tool.delete();
  }
}

function assertRefs(refs: MeasureRef[]) {
  if (refs.length < 1 || refs.length > 2) throw new Error("Для измерения выберите один или два объекта.");
}

export function measureShapes(refs: MeasureRef[], lookup: BodyLookup): MeasureResult {
  assertRefs(refs);
  const items = refs.map((ref) => measureRef(ref, lookup));
  if (refs.length === 1) return { items, pair: null };
  const [first, second] = refs;
  const { distance, points } = withRefShape(first, lookup, (a) => withRefShape(second, lookup, (b) => minimumDistance(a, b)));
  return { items, pair: measuredPair(items[0], items[1], distance, points) };
}

export async function runMeasureRequest(request: MeasureRequest, lookup: BodyLookup): Promise<MeasureResult> {
  await initOcct();
  return measureShapes(request.refs, lookup);
}
