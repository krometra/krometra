import { browserMeshData, type BrowserEdgeMesh, type BrowserMeshNames, type BrowserShapeMesh } from "@/lib/browserMesh";
import type { Fingerprint, TopologySnapshot } from "@/lib/browserNaming";
import type { MeshData } from "@/types/api";

export interface PlateGrid {
  columns: number;
  rows: number;
  subdivisions: number;
}

const CELL = 10;

const FACE_HASH_BASE = 1000;
const EDGE_HASH_BASE = 500000;

export function plateSize(grid: PlateGrid) {
  return { width: grid.columns * CELL, height: grid.rows * CELL };
}

export function squareGrid(side: number, subdivisions: number): PlateGrid {
  return { columns: side, rows: side, subdivisions };
}

function gridEdges(columns: number, rows: number) {
  const edges: { from: [number, number]; to: [number, number]; faces: number[] }[] = [];
  const cell = (column: number, row: number) => (column >= 0 && column < columns && row >= 0 && row < rows ? [row * columns + column] : []);
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column < columns; column++) {
      edges.push({ from: [column, row], to: [column + 1, row], faces: [...cell(column, row - 1), ...cell(column, row)] });
    }
  }
  for (let column = 0; column <= columns; column++) {
    for (let row = 0; row < rows; row++) {
      edges.push({ from: [column, row], to: [column, row + 1], faces: [...cell(column - 1, row), ...cell(column, row)] });
    }
  }
  return edges;
}

function faceMesh(grid: PlateGrid): BrowserShapeMesh {
  const { columns, rows, subdivisions } = grid;
  const vertices: number[] = [];
  const triangles: number[] = [];
  const faceGroups: BrowserShapeMesh["faceGroups"] = [];
  const stride = subdivisions + 1;
  for (let face = 0; face < columns * rows; face++) {
    const base = vertices.length / 3;
    const start = triangles.length;
    for (let j = 0; j <= subdivisions; j++) {
      for (let i = 0; i <= subdivisions; i++) {
        vertices.push(((face % columns) + i / subdivisions) * CELL, (Math.floor(face / columns) + j / subdivisions) * CELL, 0);
      }
    }
    for (let j = 0; j < subdivisions; j++) {
      for (let i = 0; i < subdivisions; i++) {
        const corner = base + j * stride + i;
        triangles.push(corner, corner + 1, corner + stride + 1, corner, corner + stride + 1, corner + stride);
      }
    }
    faceGroups.push({ start, count: triangles.length - start, faceId: FACE_HASH_BASE + face });
  }
  return { vertices, triangles, faceGroups };
}

function edgeMesh(grid: PlateGrid): BrowserEdgeMesh {
  const lines: number[] = [];
  const edgeGroups: BrowserEdgeMesh["edgeGroups"] = [];
  gridEdges(grid.columns, grid.rows).forEach(({ from, to }, edge) => {
    const start = lines.length / 3;
    for (let step = 0; step <= grid.subdivisions; step++) {
      const t = step / grid.subdivisions;
      lines.push((from[0] + (to[0] - from[0]) * t) * CELL, (from[1] + (to[1] - from[1]) * t) * CELL, 0);
    }
    edgeGroups.push({ start, count: grid.subdivisions + 1, edgeId: EDGE_HASH_BASE + edge });
  });
  return { lines, edgeGroups };
}

function meshNames(grid: PlateGrid): BrowserMeshNames {
  const faceEdges = new Map<string, string[]>();
  const edges = gridEdges(grid.columns, grid.rows);
  edges.forEach(({ faces }, edge) => {
    for (const face of faces) faceEdges.set(`f-${face}`, [...(faceEdges.get(`f-${face}`) ?? []), `e-${edge}`]);
  });
  return {
    faces: new Map(Array.from({ length: grid.columns * grid.rows }, (_, face) => [FACE_HASH_BASE + face, `f-${face}`])),
    edges: new Map(edges.map((_, edge) => [EDGE_HASH_BASE + edge, `e-${edge}`])),
    faceEdges,
  };
}

export function rawPlateMesh(grid: PlateGrid) {
  return { shape: faceMesh(grid), edges: edgeMesh(grid), names: meshNames(grid) };
}

export function plateMesh(grid: PlateGrid): MeshData {
  const raw = rawPlateMesh(grid);
  return browserMeshData(raw.shape, raw.edges, raw.names);
}

export function plateTopology(columns: number, rows: number): TopologySnapshot {
  const faces = Array.from({ length: columns * rows }, (_, face): Fingerprint => [
    ((face % columns) + 0.5) * CELL,
    (Math.floor(face / columns) + 0.5) * CELL,
    0,
    CELL * CELL,
  ]);
  const edges = gridEdges(columns, rows).map(({ from, to, faces: adjacent }) => ({
    faces: adjacent,
    fingerprint: [((from[0] + to[0]) / 2) * CELL, ((from[1] + to[1]) / 2) * CELL, 0, CELL] as Fingerprint,
  }));
  return { faces, edges };
}
