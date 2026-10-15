import { makePolygon, measureVolume, revolution } from "replicad";
import type { Face, Shape3D } from "replicad";
import { nameBody } from "@/lib/browserNaming";
import {
  bboxCorners,
  distinctCenters,
  HoleError,
  holePolygon,
  holeProfile,
  holeRoleProbes,
  holeThroughDepth,
  MAX_HOLES,
  projectOntoPlane,
  sketchHoleCenters,
  type HoleSpec,
} from "@/lib/holeGeometry";
import type { Vec3 } from "@/lib/threadGeometry";
import type { PlaneBasis, SketchEntity, SketchPlane } from "@/types/api";
import { namedBoolean } from "./boolean";
import { faceByName, touches, withTopology, type NamedShape } from "./naming";
import { isValidShape } from "./thread";
import type { BodyLookup } from "./types";

export interface HoleBuildRequest {
  id: number;
  kind: "hole";
  bodyId: string;
  faceId: string | number;
  facePoints: Vec3[];
  centers: Vec3[];
  entities: SketchEntity[] | null;
  plane: SketchPlane;
  planeOffset: number;
  planeBasis: PlaneBasis | null;
  spec: HoleSpec;
  featureKey: string;
}

interface HoleSeat {
  face: Face;
  origin: Vec3;
  normal: Vec3;
}

const VOLUME_EPSILON = 1e-6;

function onFace(face: Face, points: Vec3[]) {
  return face.geomType === "PLANE" && points.length > 0 && points.every((point) => touches(face.wrapped, point));
}

function findHoleFace(body: NamedShape, request: HoleBuildRequest): Face {
  if (body.naming.faces.includes(String(request.faceId))) return faceByName(body, String(request.faceId));
  const face = body.shape.faces.find((candidate) => onFace(candidate, request.facePoints));
  if (!face) throw new HoleError("face_not_found", "Грань под отверстие не найдена — выберите плоскую грань заново.");
  return face;
}

function holeSeat(body: NamedShape, request: HoleBuildRequest): HoleSeat {
  const face = findHoleFace(body, request);
  if (face.geomType !== "PLANE") throw new HoleError("face_not_planar", "Отверстие ставится только на плоскую грань.");
  const origin = face.pointOnSurface(0.5, 0.5).toTuple() as Vec3;
  return { face, origin, normal: face.normalAt(origin).toTuple() as Vec3 };
}

function requestedCenters(request: HoleBuildRequest): Vec3[] {
  if (!request.entities) return request.centers;
  return sketchHoleCenters({ ...request, entities: request.entities });
}

function seatedCenters(seat: HoleSeat, request: HoleBuildRequest): Vec3[] {
  const centers = distinctCenters(requestedCenters(request).map((point) => projectOntoPlane(point, seat.origin, seat.normal)));
  if (centers.length === 0) {
    throw new HoleError("no_centers", "Не заданы центры отверстий: кликните по грани или выберите эскиз с окружностями.");
  }
  if (centers.length > MAX_HOLES) throw new HoleError("too_many_holes", `Одной операцией можно сделать не больше ${MAX_HOLES} отверстий.`);
  const outside = centers.findIndex((center) => !touches(seat.face.wrapped, center));
  if (outside >= 0) throw new HoleError("center_off_face", `Центр отверстия ${outside + 1} лежит вне выбранной грани.`);
  return centers;
}

function namedTool(tool: Shape3D, probes: { key: string; point: Vec3 }[], featureKey: string): NamedShape {
  const naming = withTopology(tool, (topology) => nameBody({
    featureKey,
    faceCount: topology.faces.length,
    lineages: [],
    generated: probes.map(({ key, point }) => ({
      key,
      images: topology.faces.map((face, index) => (touches(face, point) ? index : -1)).filter((index) => index >= 0),
    })),
  }, topology.snapshot));
  return { shape: tool, naming };
}

function holeTool(spec: HoleSpec, corners: Vec3[], center: Vec3, axis: Vec3, featureKey: string): NamedShape {
  const profile = holeProfile(spec, holeThroughDepth(corners, center, axis));
  const polygon = makePolygon(holePolygon(profile, center, axis));
  try {
    return namedTool(revolution(polygon, center, axis, 360), holeRoleProbes(profile, center, axis), featureKey);
  } finally {
    polygon.delete();
  }
}

function cutHole(body: NamedShape, tool: NamedShape, featureKey: string, number: number): NamedShape {
  let result: NamedShape;
  try {
    result = namedBoolean(body, tool, "subtract", featureKey);
  } catch {
    throw new HoleError("hole_cut_failed", `Отверстие ${number} не вырезалось. Измените размеры или положение.`);
  } finally {
    tool.shape.delete();
  }
  if (!(measureVolume(result.shape) < measureVolume(body.shape) - VOLUME_EPSILON)) {
    result.shape.delete();
    throw new HoleError("hole_misses_body", `Отверстие ${number} не задевает тело — проверьте положение центра.`);
  }
  return result;
}

function bodyCorners(body: NamedShape): Vec3[] {
  const box = body.shape.boundingBox;
  try {
    const [min, max] = box.bounds;
    return bboxCorners(min, max);
  } finally {
    box.delete();
  }
}

function cutHoles(body: NamedShape, centers: Vec3[], axis: Vec3, request: HoleBuildRequest): NamedShape {
  const corners = bodyCorners(body);
  let current = body;
  try {
    centers.forEach((center, index) => {
      const tool = holeTool(request.spec, corners, center, axis, `${request.featureKey}/h${index}`);
      const next = cutHole(current, tool, request.featureKey, index + 1);
      if (current !== body) current.shape.delete();
      current = next;
    });
  } catch (error) {
    if (current !== body) current.shape.delete();
    throw error;
  }
  return current;
}

export function holeNamed(request: HoleBuildRequest, lookup: BodyLookup): NamedShape {
  const body = lookup(request.bodyId);
  const seat = holeSeat(body, request);
  try {
    const centers = seatedCenters(seat, request);
    const axis = seat.normal.map((component) => 0 - component) as Vec3;
    const result = cutHoles(body, centers, axis, request);
    if (!isValidShape(result.shape)) {
      result.shape.delete();
      throw new HoleError("hole_invalid", "Отверстия с такими размерами ломают тело — измените диаметр, глубину или положение.");
    }
    return result;
  } finally {
    seat.face.delete();
  }
}
