import { makeCompound } from "replicad";
import type { Shape3D } from "replicad";
import { QUALITY_PRESETS, meshTolerance, type MeshTolerance } from "@/lib/meshQuality";
import { threeMfArchive } from "@/lib/threeMf";
import { bodyShape } from "./shapes";
import type { ExportRequest } from "./types";

export interface ExportEstimateRequest {
  id: number;
  kind: "export-estimate";
  bodyIds: string[];
  mesh: MeshTolerance;
}

const NOTHING_TO_EXPORT = "Нечего экспортировать: нет видимых тел.";
const NORMAL_MESH = meshTolerance(QUALITY_PRESETS.normal);

function exportedShapes(bodyIds: string[]): Shape3D[] {
  const shapes = bodyIds.map((bodyId) => bodyShape(bodyId));
  if (shapes.length === 0) throw new Error(NOTHING_TO_EXPORT);
  return shapes;
}

function withCombined<T>(shapes: Shape3D[], use: (shape: Shape3D) => T): T {
  const combined = shapes.length === 1 ? shapes[0] : makeCompound(shapes.map((shape) => shape.clone())) as Shape3D;
  try {
    return use(combined);
  } finally {
    if (combined !== shapes[0]) combined.delete();
  }
}

function exportStl(shapes: Shape3D[], mesh: MeshTolerance): Blob {
  return withCombined(shapes, (shape) => shape.blobSTL({ ...mesh, binary: true }));
}

async function export3mf(shapes: Shape3D[], mesh: MeshTolerance, names: string[]): Promise<ArrayBuffer> {
  const parts = shapes.map((shape, index) => ({
    name: names[index] ?? `Тело ${index + 1}`,
    ...shape.mesh(mesh),
  }));
  const archive = await threeMfArchive(parts);
  return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
}

export async function exportBodies(request: ExportRequest): Promise<ArrayBuffer> {
  const shapes = exportedShapes(request.bodyIds);
  if (request.format === "step") return withCombined(shapes, (shape) => shape.blobSTEP()).arrayBuffer();
  const mesh = request.mesh ?? NORMAL_MESH;
  if (request.format === "stl") return exportStl(shapes, mesh).arrayBuffer();
  return export3mf(shapes, mesh, request.names ?? []);
}

export function estimateTriangles(request: ExportEstimateRequest): number {
  return exportedShapes(request.bodyIds).reduce(
    (total, shape) => total + shape.mesh(request.mesh).triangles.length / 3,
    0,
  );
}
