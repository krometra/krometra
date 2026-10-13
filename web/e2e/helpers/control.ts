import type { CadEditor } from "./cad";

export interface Feature {
  feature: { id: string; kind: string; status: string; bodyId: string; params: Record<string, unknown> };
  mode: string;
}

export interface Face {
  id: string;
  planar: boolean;
  normal: number[] | null;
  area: number;
  bbox: { min: number[]; max: number[] } | null;
}

export interface TopoEdge {
  id: string;
  start: number[];
  end: number[];
  length: number;
  closed: boolean;
}

export interface Topo {
  bbox: { min: number[]; max: number[] };
  faces: Face[];
  edges: TopoEdge[];
}

export interface ExportedFile {
  mime: string;
  filename: string;
  dataBase64: string;
}

export function readStl(file: ExportedFile): { triangles: number; size: number } {
  const bytes = Buffer.from(file.dataBase64, "base64");
  return { triangles: bytes.readUInt32LE(80), size: bytes.length };
}

export const rect = (x1: number, y1: number, x2: number, y2: number) => ({
  type: "rectangle",
  corner1: { x: x1, y: y1 },
  corner2: { x: x2, y: y2 },
});

export const circle = (x: number, y: number, radius: number) => ({ type: "circle", center: { x, y }, radius });

export const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;

export function isVertical(edge: TopoEdge): boolean {
  return near(edge.start[0], edge.end[0]) && near(edge.start[1], edge.end[1]) && !near(edge.start[2], edge.end[2]);
}

export async function errorCode(cad: CadEditor, op: string, params?: Record<string, unknown>): Promise<string> {
  const reply = await cad.request(op, params);
  return reply.ok ? "ok" : reply.error.code;
}

export async function sceneBodies(cad: CadEditor): Promise<string[]> {
  return (await cad.control<{ visibleBodyIds: string[] }>("scene.get")).visibleBodyIds;
}

export async function channelKinds(cad: CadEditor): Promise<string[]> {
  return (await cad.control<{ timeline: { kind: string }[] }>("state")).timeline.map((entry) => entry.kind);
}
