import { Edge, Face, getOC, makeCylinder, measureVolume } from "replicad";
import type { Shape3D } from "replicad";
import type { TopoDS_Shape } from "replicad-opencascadejs";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import { axialLevels, isPressPullSurface, pressPullFailureMessage, tubeRadii, unsupportedSurfaceMessage } from "@/lib/browserPressPull";
import { dot, type Vec3 } from "@/lib/threadGeometry";
import { shape3DOf } from "./boolean";
import type { NamedShape } from "./naming";
import { describeThreadCylinder } from "./thread";
import type { Topology } from "./topology";

export interface SourceFace {
  name: string;
  shape: TopoDS_Shape;
  surface: string;
  edges: { name: string; midpoint: Vector3 }[];
  seamed: boolean;
  boundary: Vector3[];
}

const LEVEL_TOLERANCE = 1e-5;

export function surfaceOf(shape: TopoDS_Shape): string {
  const face = new Face(getOC().TopoDS.Face(shape));
  try {
    return face.geomType;
  } finally {
    face.delete();
  }
}

function pointsAlong(shape: TopoDS_Shape, positions: number[]): Vector3[] {
  const edge = new Edge(getOC().TopoDS.Edge(shape));
  try {
    return positions.map((position) => {
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
}

export function sourceFace(body: NamedShape, topology: Topology, index: number): SourceFace {
  const shape = topology.faces[index];
  const surface = surfaceOf(shape);
  if (!isPressPullSurface(surface)) throw new Error(unsupportedSurfaceMessage(surface));
  const bounding = topology.snapshot.edges
    .map((edge, edgeIndex) => ({ uses: edge.faces.filter((face) => face === index).length, edgeIndex }))
    .filter(({ uses }) => uses > 0);
  return {
    name: body.naming.faces[index],
    shape,
    surface,
    edges: bounding.map(({ edgeIndex }) => ({ name: body.naming.edges[edgeIndex], midpoint: pointsAlong(topology.edges[edgeIndex], [0.5])[0] })),
    seamed: bounding.some(({ uses }) => uses > 1),
    boundary: bounding.filter(({ uses }) => uses === 1).flatMap(({ edgeIndex }) => pointsAlong(topology.edges[edgeIndex], [0, 0.25, 0.5, 0.75])),
  };
}

function outwardNormal(shape: TopoDS_Shape): Vector3 {
  const face = new Face(getOC().TopoDS.Face(shape));
  const normal = face.normalAt();
  const unit = normal.normalize();
  try {
    return unit.toTuple() as Vector3;
  } finally {
    unit.delete();
    normal.delete();
    face.delete();
  }
}

function planarSlab(source: SourceFace, distance: number): Shape3D {
  const oc = getOC();
  const [x, y, z] = outwardNormal(source.shape);
  const vector = new oc.gp_Vec(x * distance, y * distance, z * distance);
  const prism = new oc.BRepPrimAPI_MakePrism(source.shape, vector, true, true);
  try {
    return shape3DOf(prism.Shape(), pressPullFailureMessage(distance));
  } finally {
    prism.delete();
    vector.delete();
  }
}

function tubeSlab(source: SourceFace, distance: number): Shape3D | null {
  if (!source.seamed) return null;
  const face = new Face(getOC().TopoDS.Face(source.shape));
  try {
    const cylinder = describeThreadCylinder(face);
    const origin = dot(cylinder.origin, cylinder.direction);
    const levels = axialLevels(source.boundary.map((point) => dot(point, cylinder.direction) - origin), LEVEL_TOLERANCE);
    if (!levels) return null;
    const radii = tubeRadii(cylinder.radius, cylinder.external, distance);
    if (!radii) throw new Error(pressPullFailureMessage(distance));
    const base = cylinder.origin.map((value, axis) => value + cylinder.direction[axis] * levels[0]) as Vec3;
    const outer = makeCylinder(radii.outer, levels[1] - levels[0], base, cylinder.direction);
    const inner = makeCylinder(radii.inner, levels[1] - levels[0], base, cylinder.direction);
    try {
      return shape3DOf(outer.cut(inner).wrapped, pressPullFailureMessage(distance));
    } finally {
      outer.delete();
      inner.delete();
    }
  } finally {
    face.delete();
  }
}

function detachedCopy(shape: TopoDS_Shape): TopoDS_Shape {
  const oc = getOC();
  const identity = new oc.gp_Trsf();
  const copy = new oc.BRepBuilderAPI_Transform(shape, identity, true, false);
  try {
    return copy.Shape();
  } finally {
    copy.delete();
    identity.delete();
  }
}

function thickSlab(face: TopoDS_Shape, distance: number): Shape3D {
  const thick = new (getOC().BRepOffsetAPI_MakeThickSolid)();
  const detached = detachedCopy(face);
  try {
    thick.MakeThickSolidBySimple(detached, distance);
    if (!thick.IsDone()) throw new Error(pressPullFailureMessage(distance));
    return shape3DOf(thick.Shape(), pressPullFailureMessage(distance));
  } finally {
    detached.delete();
    thick.delete();
  }
}

function offsetSlab(source: SourceFace, distance: number): Shape3D {
  const slab = thickSlab(source.shape, distance);
  if (measureVolume(slab) >= 0) return slab;
  slab.delete();
  const reversed = source.shape.Reversed();
  try {
    return thickSlab(reversed, -distance);
  } finally {
    reversed.delete();
  }
}

export function slabOf(source: SourceFace, distance: number): Shape3D {
  const slab = source.surface === "PLANE" ? planarSlab(source, distance) : tubeSlab(source, distance) ?? offsetSlab(source, distance);
  if (measureVolume(slab) > 0) return slab;
  slab.delete();
  throw new Error(pressPullFailureMessage(distance));
}
