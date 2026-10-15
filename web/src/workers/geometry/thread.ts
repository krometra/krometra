import { getOC, makeCompound, makeCylinder, makePolygon, makeSolid, measureVolume } from "replicad";
import type { Face, Shape3D } from "replicad";
import {
  axialExtent,
  helixRings,
  helixTriangles,
  isOutwardNormal,
  orientCylinderAxis,
  pointsOnCylinder,
  resolveThreadPlan,
  startAngles,
  ThreadError,
  type ThreadCylinderInfo,
  type ThreadOptions,
  type ThreadPlan,
  type Vec3,
} from "@/lib/threadGeometry";
import { namedBoolean } from "./boolean";
import { faceByName, namedFresh, type NamedShape } from "./naming";

export interface ThreadFaceRef {
  faceId: string | number;
  facePoints: Vec3[];
}

export interface ThreadCylinderRequest extends ThreadFaceRef {
  id: number;
  kind: "thread-cylinder";
  bodyId: string;
}

export interface ThreadBuildRequest extends ThreadFaceRef {
  id: number;
  kind: "thread";
  bodyId: string;
  options: ThreadOptions;
  featureKey: string;
}

export type ThreadWorkerRequest = ThreadCylinderRequest | ThreadBuildRequest;

interface ThreadCore<Published> {
  init: () => Promise<void>;
  lookup: (bodyId: string) => NamedShape;
  publishShape: (named: NamedShape, startedAt: number) => Promise<Published>;
}

const CLIP_RADIUS_FACTOR = 4;
const CLIP_RADIUS_MARGIN = 10;

export function cylinderAxis(face: Face) {
  const adaptor = new (getOC().BRepAdaptor_Surface)(face.wrapped, false);
  try {
    const cylinder = adaptor.Cylinder();
    const axis = cylinder.Axis();
    const direction = axis.Direction();
    const location = axis.Location();
    return {
      radius: cylinder.Radius(),
      origin: [location.X(), location.Y(), location.Z()] as Vec3,
      direction: [direction.X(), direction.Y(), direction.Z()] as Vec3,
    };
  } finally {
    adaptor.delete();
  }
}

function faceVertices(face: Face): Vec3[] {
  return face.edges.flatMap((edge) => [edge.startPoint.toTuple(), edge.endPoint.toTuple()] as Vec3[]);
}

export function describeThreadCylinder(face: Face): ThreadCylinderInfo {
  if (face.geomType !== "CYLINDRE") {
    throw new ThreadError(
      "face_not_cylindrical",
      "Резьба строится только на цилиндрической грани — выберите боковую поверхность стержня или стенку отверстия.",
    );
  }
  const axis = cylinderAxis(face);
  const oriented = orientCylinderAxis(axis.direction, axialExtent(faceVertices(face), axis.origin, axis.direction));
  const probe = face.pointOnSurface(0.5, 0.5).toTuple() as Vec3;
  const normal = face.normalAt(probe).toTuple() as Vec3;
  return {
    radius: axis.radius,
    origin: axis.origin,
    direction: oriented.direction,
    start: oriented.start,
    length: oriented.end - oriented.start,
    external: isOutwardNormal(probe, normal, axis.origin, oriented.direction),
  };
}

function matchesFacePoints(face: Face, points: Vec3[]) {
  if (face.geomType !== "CYLINDRE") return false;
  const cylinder = describeThreadCylinder(face);
  return pointsOnCylinder(points, cylinder, Math.max(1e-3, cylinder.radius * 1e-4));
}

export function findThreadFace(body: NamedShape, ref: ThreadFaceRef): Face {
  if (body.naming.faces.includes(String(ref.faceId))) return faceByName(body, String(ref.faceId));
  const face = body.shape.faces.find((candidate) => matchesFacePoints(candidate, ref.facePoints));
  if (!face) {
    throw new ThreadError("face_not_found", "Цилиндрическая грань не найдена — выберите боковую поверхность стержня или стенку отверстия.");
  }
  return face;
}

function helixTool(cylinder: ThreadCylinderInfo, plan: ThreadPlan, startAngle: number): Shape3D {
  const faces = helixTriangles(helixRings(cylinder, plan, startAngle)).map((triangle) => makePolygon(triangle));
  try {
    return makeSolid(faces);
  } catch {
    throw new ThreadError("thread_tool_failed", "Не удалось построить винтовую поверхность резьбы. Проверьте шаг, глубину и длину.");
  } finally {
    for (const face of faces) face.delete();
  }
}

function axialClip(cylinder: ThreadCylinderInfo, plan: ThreadPlan): Shape3D {
  const { origin: o, direction: d } = cylinder;
  const base = [0, 1, 2].map((axis) => o[axis] + d[axis] * plan.clipFrom) as Vec3;
  return makeCylinder(cylinder.radius * CLIP_RADIUS_FACTOR + CLIP_RADIUS_MARGIN, plan.length, base, d);
}

function clippedTool(cylinder: ThreadCylinderInfo, plan: ThreadPlan, startAngle: number): Shape3D {
  const tool = helixTool(cylinder, plan, startAngle);
  const clip = axialClip(cylinder, plan);
  try {
    return tool.intersect(clip);
  } finally {
    tool.delete();
    clip.delete();
  }
}

export function isValidShape(shape: Shape3D) {
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  try {
    return analyzer.IsValid();
  } finally {
    analyzer.delete();
  }
}

export function cutThread(body: NamedShape, cylinder: ThreadCylinderInfo, plan: ThreadPlan, featureKey: string): NamedShape {
  const tools = startAngles(plan.starts).map((angle) => clippedTool(cylinder, plan, angle));
  const tool = tools.length === 1 ? tools[0] : (makeCompound(tools) as unknown as Shape3D);
  let result: NamedShape;
  try {
    result = namedBoolean(body, namedFresh(tool, `${featureKey}/tool`), "subtract", featureKey);
  } catch {
    throw new ThreadError("thread_cut_failed", "Вычитание резьбы не удалось. Попробуйте другой шаг или глубину.");
  } finally {
    tool.delete();
  }
  if (!isValidShape(result.shape) || !(measureVolume(result.shape) < measureVolume(body.shape))) {
    result.shape.delete();
    throw new ThreadError(
      "thread_invalid",
      "Резьба с такими параметрами ломает тело — уменьшите глубину, увеличьте шаг или сузьте вершину профиля.",
    );
  }
  return result;
}

export function threadBody(body: NamedShape, ref: ThreadFaceRef, options: ThreadOptions, featureKey: string) {
  const cylinder = describeThreadCylinder(findThreadFace(body, ref));
  const plan = resolveThreadPlan(cylinder, options);
  return { named: cutThread(body, cylinder, plan, featureKey), cylinder, plan };
}

export function threadNamed(request: ThreadBuildRequest, lookup: (bodyId: string) => NamedShape): NamedShape {
  return threadBody(lookup(request.bodyId), request, request.options, request.featureKey).named;
}

function describeRequestedCylinder(body: NamedShape, ref: ThreadFaceRef) {
  try {
    return { cylindrical: true as const, cylinder: describeThreadCylinder(findThreadFace(body, ref)) };
  } catch (error) {
    if (error instanceof ThreadError) return { cylindrical: false as const, reason: error.message };
    throw error;
  }
}

export async function runThreadRequest<Published>(request: ThreadWorkerRequest, core: ThreadCore<Published>) {
  await core.init();
  const startedAt = performance.now();
  const body = core.lookup(request.bodyId);
  if (request.kind === "thread-cylinder") return describeRequestedCylinder(body, request);
  const { named, cylinder, plan } = threadBody(body, request, request.options, request.featureKey);
  try {
    const published = await core.publishShape(named, startedAt);
    return { ...published, cylinder, depth: plan.depth, length: plan.length };
  } catch (error) {
    named.shape.delete();
    throw error;
  }
}
