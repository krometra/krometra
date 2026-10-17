import type { SketchPlane } from "@/types/api";
import type { Vec3 } from "@/lib/threadGeometry";
import type { AxisRef, PlaneRef, PointRef, WorkPlaneDefinition, WorkPlaneKind } from "@/lib/workPlane";
import { INVALID, isPlainObject } from "./params";
import { fail } from "./protocol";

export type PointInput = { vertex: Vec3 } | { sketchId: string; entityId: string; subIndex: number };

export interface WorkPlaneParams {
  kind: WorkPlaneKind;
  bodyId?: string;
  plane?: SketchPlane;
  faceId?: string;
  referenceSketchId?: string;
  distance?: number;
  edgeId?: string;
  lineSketchId?: string;
  lineId?: string;
  angle?: number;
  points?: PointInput[];
  faceIds?: string[];
}

export type VertexResolver = (bodyId: string, point: Vec3) => PointRef | null;

export const POINT_INPUT_FORMAT = "{ vertex: [x, y, z] } — вершина тела bodyId (точка прилипает к ближайшей вершине) или { sketchId, entityId, subIndex? } — точка эскиза: у отрезка 0 — начало, 1 — конец; у окружности и дуги 0 — центр, у дуги 1 и 2 — концы; у прямоугольника 0 и 1 — углы";

export function readPointInput(value: Record<string, unknown>): PointInput | typeof INVALID {
  const vertex = value.vertex;
  if (Array.isArray(vertex) && vertex.length === 3 && vertex.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return { vertex: [vertex[0], vertex[1], vertex[2]] };
  }
  const subIndex = value.subIndex ?? 0;
  if (typeof value.sketchId === "string" && typeof value.entityId === "string" && Number.isInteger(subIndex)) {
    return { sketchId: value.sketchId, entityId: value.entityId, subIndex: subIndex as number };
  }
  return INVALID;
}

export function isPointInput(value: unknown): boolean {
  return isPlainObject(value) && readPointInput(value) !== INVALID;
}

function requireBody(params: WorkPlaneParams, what: string): string {
  if (!params.bodyId) throw fail("invalid_params", `${what} задаётся вместе с bodyId.`);
  return params.bodyId;
}

function reference(params: WorkPlaneParams): PlaneRef {
  const given = [params.plane, params.faceId, params.referenceSketchId].filter((value) => value !== undefined);
  if (given.length > 1) throw fail("invalid_params", "Опорную плоскость задайте одним из: plane, faceId (с bodyId) или referenceSketchId.");
  if (params.faceId !== undefined) return { kind: "face", bodyId: requireBody(params, "faceId"), faceName: params.faceId };
  if (params.referenceSketchId !== undefined) return { kind: "sketch", sketchId: params.referenceSketchId };
  return { kind: "base", plane: params.plane ?? "XY" };
}

function axis(params: WorkPlaneParams): AxisRef {
  const onSketch = params.lineSketchId !== undefined || params.lineId !== undefined;
  if (onSketch === (params.edgeId !== undefined)) {
    throw fail("invalid_params", "Ось задайте ровно одним способом: edgeId (с bodyId) или lineSketchId вместе с lineId.");
  }
  if (params.edgeId !== undefined) return { kind: "edge", bodyId: requireBody(params, "edgeId"), edgeName: params.edgeId };
  if (!params.lineSketchId || !params.lineId) throw fail("invalid_params", "Отрезок эскиза задаётся парой lineSketchId и lineId.");
  return { kind: "sketch_line", sketchId: params.lineSketchId, entityId: params.lineId };
}

function point(params: WorkPlaneParams, input: PointInput, resolveVertex: VertexResolver): PointRef {
  if ("sketchId" in input) return { kind: "sketch_point", sketchId: input.sketchId, entityId: input.entityId, subIndex: input.subIndex };
  const bodyId = requireBody(params, "Вершина");
  const resolved = resolveVertex(bodyId, input.vertex);
  if (!resolved) throw fail("not_found", `У тела «${bodyId}» нет вершины в точке [${input.vertex.join(", ")}].`);
  return resolved;
}

export function requestedWorkPlane(params: WorkPlaneParams, resolveVertex: VertexResolver): WorkPlaneDefinition {
  if (params.kind === "offset") return { kind: "offset", reference: reference(params), distance: params.distance ?? 0 };
  if (params.kind === "angle") return { kind: "angle", axis: axis(params), reference: reference(params), angle: params.angle ?? 90 };
  if (params.kind === "three_points") {
    if (params.points?.length !== 3) throw fail("invalid_params", "Для плоскости по трём точкам передайте points ровно из трёх точек.");
    return { kind: "three_points", points: params.points.map((input) => point(params, input, resolveVertex)) };
  }
  if (params.faceIds?.length !== 2) throw fail("invalid_params", "Для средней плоскости передайте faceIds из двух граней тела bodyId.");
  const bodyId = requireBody(params, "faceIds");
  return { kind: "midplane", faces: params.faceIds.map((faceName) => ({ bodyId, faceName })) };
}
