import { expect } from "vitest";
import { getOC, importSTEP, measureArea, measureShapeVolumeProperties } from "replicad";
import type { Shape3D } from "replicad";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import { bodyShape } from "../geometry/shapes";
import { buildBody, edgeNames, faceNames, type WorkerReply } from "./workerHarness";

export interface ShapeMetrics {
  volume: number;
  center: Vector3;
  area: number;
  min: Vector3;
  max: Vector3;
  valid: boolean;
  solids: number;
  faces: number;
  edges: number;
}

export interface TriangleMetrics {
  volume: number;
  min: Vector3;
  max: Vector3;
  triangles: number;
}

export interface ShapeFixture {
  volume: number;
  min: Vector3;
  max: Vector3;
  center?: Vector3;
  area?: number;
  faces?: number;
  edges?: number;
  solids?: number;
  tolerance?: number;
  meshTolerance?: number;
}

export const BOX_TOLERANCE = 1e-4;
export const SHAPE_TOLERANCE = 1e-6;
export const MESH_TOLERANCE = 0.01;
export const TESSELLATION_DEFLECTION = 0.02;
const STL_HEADER_BYTES = 80;
const STL_TRIANGLE_BYTES = 50;
const STL_NORMAL_TOLERANCE = 1e-3;

function countSolids(shape: Shape3D): number {
  const oc = getOC();
  const explorer = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try {
    let count = 0;
    for (; explorer.More(); explorer.Next()) count++;
    return count;
  } finally {
    explorer.delete();
  }
}

function isValid(shape: Shape3D): boolean {
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  try {
    return analyzer.IsValid();
  } finally {
    analyzer.delete();
  }
}

function countAndRelease(subshapes: { delete(): void }[]): number {
  subshapes.forEach((subshape) => subshape.delete());
  return subshapes.length;
}

export function shapeMetrics(shape: Shape3D): ShapeMetrics {
  const box = shape.boundingBox;
  const mass = measureShapeVolumeProperties(shape);
  try {
    const [min, max] = box.bounds;
    return {
      volume: mass.volume,
      center: mass.centerOfMass,
      area: measureArea(shape),
      min: min as Vector3,
      max: max as Vector3,
      valid: isValid(shape),
      solids: countSolids(shape),
      faces: countAndRelease(shape.faces),
      edges: countAndRelease(shape.edges),
    };
  } finally {
    box.delete();
    mass.delete();
  }
}

export function bodyMetrics(bodyId: string): ShapeMetrics {
  return shapeMetrics(bodyShape(bodyId));
}

export async function stepMetrics(step: ArrayBuffer): Promise<ShapeMetrics> {
  const shape = await importSTEP(new Blob([step], { type: "application/step" })) as Shape3D;
  try {
    return shapeMetrics(shape);
  } finally {
    shape.delete();
  }
}

export function triangleMetrics(positions: ArrayLike<number>, indices: ArrayLike<number>): TriangleMetrics {
  const min: Vector3 = [Infinity, Infinity, Infinity];
  const max: Vector3 = [-Infinity, -Infinity, -Infinity];
  let sixVolumes = 0;
  for (let corner = 0; corner + 2 < indices.length; corner += 3) {
    const [a, b, c] = [0, 1, 2].map((offset) => {
      const vertex = indices[corner + offset] * 3;
      return [positions[vertex], positions[vertex + 1], positions[vertex + 2]] as Vector3;
    });
    for (const point of [a, b, c]) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
    sixVolumes += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return { volume: sixVolumes / 6, min, max, triangles: Math.floor(indices.length / 3) };
}

function facetNormal(corners: number[]): Vector3 {
  const [ux, uy, uz] = [corners[3] - corners[0], corners[4] - corners[1], corners[5] - corners[2]];
  const [vx, vy, vz] = [corners[6] - corners[0], corners[7] - corners[1], corners[8] - corners[2]];
  const normal: Vector3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const length = Math.hypot(...normal);
  return length > 0 ? [normal[0] / length, normal[1] / length, normal[2] / length] : normal;
}

export function binaryStlMetrics(file: ArrayBuffer): TriangleMetrics & { misdirectedNormals: number } {
  const view = new DataView(file);
  const declared = view.getUint32(STL_HEADER_BYTES, true);
  expect(file.byteLength, "длина бинарного STL").toBe(STL_HEADER_BYTES + 4 + declared * STL_TRIANGLE_BYTES);
  const positions: number[] = [];
  let misdirectedNormals = 0;
  for (let triangle = 0; triangle < declared; triangle++) {
    const start = STL_HEADER_BYTES + 4 + triangle * STL_TRIANGLE_BYTES;
    const values = Array.from({ length: 12 }, (_, index) => view.getFloat32(start + index * 4, true));
    const stored = values.slice(0, 3);
    const corners = values.slice(3);
    const computed = facetNormal(corners);
    if (stored[0] * computed[0] + stored[1] * computed[1] + stored[2] * computed[2] < 1 - STL_NORMAL_TOLERANCE) misdirectedNormals++;
    positions.push(...corners);
  }
  const metrics = triangleMetrics(positions, Array.from({ length: declared * 3 }, (_, index) => index));
  return { ...metrics, misdirectedNormals };
}

export function boxFixture(min: Vector3, max: Vector3): ShapeFixture {
  const [x, y, z] = [0, 1, 2].map((axis) => max[axis] - min[axis]);
  const center = [0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2) as Vector3;
  return { volume: x * y * z, center, area: 2 * (x * y + y * z + x * z), min, max, faces: 6, edges: 12 };
}

function margin(expected: number, tolerance: number): number {
  return Math.max(Math.abs(expected) * tolerance, tolerance);
}

export function expectNear(actual: number, expected: number, allowed: number, what: string) {
  expect(Math.abs(actual - expected), `${what}: получено ${actual}, эталон ${expected}, допуск ${allowed}`).toBeLessThanOrEqual(allowed);
}

function expectPoint(actual: Vector3, expected: Vector3, allowed: number, what: string) {
  for (let axis = 0; axis < 3; axis++) expectNear(actual[axis], expected[axis], allowed, `${what}[${axis}]`);
}

export function expectBounds(actual: { min: Vector3; max: Vector3 }, expected: { min: Vector3; max: Vector3 }, allowed: number, what: string) {
  for (let axis = 0; axis < 3; axis++) {
    expectNear(actual.min[axis], expected.min[axis], allowed, `${what}: min[${axis}]`);
    expectNear(actual.max[axis], expected.max[axis], allowed, `${what}: max[${axis}]`);
  }
}

export function expectMetrics(actual: ShapeMetrics, expected: ShapeFixture) {
  const tolerance = expected.tolerance ?? SHAPE_TOLERANCE;
  expect(actual.valid, "форма не проходит BRepCheck").toBe(true);
  expect(actual.solids, "число твёрдых тел").toBe(expected.solids ?? 1);
  expectNear(actual.volume, expected.volume, margin(expected.volume, tolerance), "объём");
  if (expected.area !== undefined) expectNear(actual.area, expected.area, margin(expected.area, tolerance), "площадь поверхности");
  expectBounds(actual, expected, BOX_TOLERANCE, "габариты");
  if (expected.center) expectPoint(actual.center, expected.center, BOX_TOLERANCE, "центр масс");
  if (expected.faces !== undefined) expect(actual.faces, "число граней").toBe(expected.faces);
  if (expected.edges !== undefined) expect(actual.edges, "число рёбер").toBe(expected.edges);
}

function expectDistinctNames(names: string[], count: number, what: string) {
  expect(names, `${what}: число имён`).toHaveLength(count);
  expect(new Set(names).size, `${what}: дубли имён`).toBe(count);
  expect(names.filter((name) => name.trim() === "" || name.startsWith("#")), `${what}: пустые или физические имена`).toEqual([]);
}

export function expectNames(reply: WorkerReply, metrics: Pick<ShapeMetrics, "faces" | "edges">) {
  const savedFaces = (reply.naming?.faces ?? []).map((face) => face.name);
  expectDistinctNames(faceNames(reply), metrics.faces, "грани меша");
  expectDistinctNames(edgeNames(reply), metrics.edges, "рёбра меша");
  expectDistinctNames(savedFaces, metrics.faces, "грани сохранённого naming");
  expect([...faceNames(reply)].sort(), "имена граней меша и naming расходятся").toEqual([...savedFaces].sort());
  const brokenPolylines = (reply.mesh?.brep_topo.edges ?? []).filter((edge) => (edge.polyline?.length ?? 0) < 6 || (edge.polyline?.length ?? 0) % 3 !== 0);
  expect(brokenPolylines.map((edge) => String(edge.edge_id)), "ребро без ломаной для отрисовки").toEqual([]);
  const knownEdges = new Set(edgeNames(reply));
  const strangers = (reply.mesh?.brep_topo.faces ?? []).flatMap((face) => (face.edges ?? []).map(String)).filter((edge) => !knownEdges.has(edge));
  expect(strangers, "грань ссылается на неизвестное ребро").toEqual([]);
  const knownFaces = new Set(faceNames(reply));
  const triangleFaces = (reply.mesh?.face_triangle_map ?? []).map(String);
  expect(triangleFaces, "карта треугольников не совпадает с числом треугольников").toHaveLength((reply.mesh?.indices.length ?? 0) / 3);
  expect(triangleFaces.filter((name) => !knownFaces.has(name)), "треугольник без именованной грани").toEqual([]);
}

export function expectMesh(reply: WorkerReply, expected: ShapeFixture) {
  const mesh = reply.mesh;
  if (!mesh) throw new Error("В ответе ядра нет меша.");
  const measured = triangleMetrics(mesh.vertices, mesh.indices);
  expectNear(measured.volume, expected.volume, margin(expected.volume, expected.meshTolerance ?? MESH_TOLERANCE), "объём меша");
  expectBounds(measured, expected, TESSELLATION_DEFLECTION, "габариты меша");
  expectBounds({ min: mesh.bbox.min as Vector3, max: mesh.bbox.max as Vector3 }, measured, 1e-9, "bbox меша");
}

export function expectSameShape(restored: ShapeMetrics, original: ShapeMetrics, what: string) {
  expect(restored.valid, `${what}: форма не проходит BRepCheck`).toBe(true);
  expect(restored.solids, `${what}: число твёрдых тел`).toBe(original.solids);
  expect(restored.faces, `${what}: число граней`).toBe(original.faces);
  expect(restored.edges, `${what}: число рёбер`).toBe(original.edges);
  expectNear(restored.volume, original.volume, margin(original.volume, SHAPE_TOLERANCE), `${what}: объём`);
  expectNear(restored.area, original.area, margin(original.area, SHAPE_TOLERANCE), `${what}: площадь поверхности`);
  expectBounds(restored, original, BOX_TOLERANCE, `${what}: габариты`);
  expectPoint(restored.center, original.center, BOX_TOLERANCE, `${what}: центр масс`);
}

export async function expectStepRoundTrip(step: ArrayBuffer | undefined, original: ShapeMetrics) {
  if (!step) throw new Error("В ответе ядра нет STEP.");
  expectSameShape(await stepMetrics(step), original, "STEP после импорта");
}

export async function expectFixture(bodyId: string, reply: WorkerReply, expected: ShapeFixture): Promise<ShapeMetrics> {
  const metrics = bodyMetrics(bodyId);
  expectMetrics(metrics, expected);
  expectNames(reply, metrics);
  expectMesh(reply, expected);
  await expectStepRoundTrip(reply.step, metrics);
  return metrics;
}

export async function buildFixture(request: Record<string, unknown>, bodyId: string, expected: ShapeFixture): Promise<WorkerReply> {
  const reply = await buildBody(request, bodyId);
  await expectFixture(bodyId, reply, expected);
  return reply;
}
