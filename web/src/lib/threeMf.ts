import { zipArchive } from "./zipArchive";

export interface MeshPart {
  name: string;
  vertices: ArrayLike<number>;
  triangles: ArrayLike<number>;
}

export interface WeldedMesh {
  vertices: number[];
  triangles: number[];
}

export const THREE_MF_MODEL_PATH = "3D/3dmodel.model";

const WELD_STEP_MM = 1e-4;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/${THREE_MF_MODEL_PATH}" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

function vertexKey(vertices: ArrayLike<number>, index: number): string {
  const at = index * 3;
  return `${Math.round(vertices[at] / WELD_STEP_MM)},${Math.round(vertices[at + 1] / WELD_STEP_MM)},${Math.round(vertices[at + 2] / WELD_STEP_MM)}`;
}

export function weldMesh(vertices: ArrayLike<number>, triangles: ArrayLike<number>): WeldedMesh {
  const indexByKey = new Map<string, number>();
  const remap: number[] = [];
  const welded: number[] = [];
  for (let index = 0; index < vertices.length / 3; index++) {
    const key = vertexKey(vertices, index);
    let target = indexByKey.get(key);
    if (target === undefined) {
      target = welded.length / 3;
      indexByKey.set(key, target);
      welded.push(vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]);
    }
    remap.push(target);
  }
  const kept: number[] = [];
  for (let at = 0; at < triangles.length; at += 3) {
    const [a, b, c] = [remap[triangles[at]], remap[triangles[at + 1]], remap[triangles[at + 2]]];
    if (a !== b && b !== c && a !== c) kept.push(a, b, c);
  }
  return { vertices: welded, triangles: kept };
}

function coordinate(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function objectXml(part: MeshPart, id: number): string {
  const mesh = weldMesh(part.vertices, part.triangles);
  const vertices: string[] = [];
  for (let at = 0; at < mesh.vertices.length; at += 3) {
    vertices.push(`<vertex x="${coordinate(mesh.vertices[at])}" y="${coordinate(mesh.vertices[at + 1])}" z="${coordinate(mesh.vertices[at + 2])}"/>`);
  }
  const triangles: string[] = [];
  for (let at = 0; at < mesh.triangles.length; at += 3) {
    triangles.push(`<triangle v1="${mesh.triangles[at]}" v2="${mesh.triangles[at + 1]}" v3="${mesh.triangles[at + 2]}"/>`);
  }
  return `<object id="${id}" name="${escapeXml(part.name)}" type="model"><mesh><vertices>${vertices.join("")}</vertices><triangles>${triangles.join("")}</triangles></mesh></object>`;
}

export function threeMfModel(parts: MeshPart[]): string {
  if (parts.length === 0) throw new Error("Нечего экспортировать: нет тел.");
  const objects = parts.map((part, index) => objectXml(part, index + 1)).join("");
  const items = parts.map((_, index) => `<item objectid="${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="ru-RU" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objects}</resources><build>${items}</build></model>`;
}

export function threeMfArchive(parts: MeshPart[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  return zipArchive([
    { name: "[Content_Types].xml", data: encoder.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: encoder.encode(RELATIONSHIPS) },
    { name: THREE_MF_MODEL_PATH, data: encoder.encode(threeMfModel(parts)) },
  ]);
}
