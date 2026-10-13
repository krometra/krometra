import type { BrepTopo, BrepTopoEdge } from "@/types/api";
import type { Vec3 } from "@/lib/threadGeometry";

export function lineEdge(id: string, from: Vec3, to: Vec3): BrepTopoEdge {
  return { edge_id: id, vertices: [], polyline: [...from, ...to] };
}

export function arcEdge(
  id: string,
  centre: Vec3,
  radius: number,
  fromDeg: number,
  toDeg: number,
  segments = 14,
): BrepTopoEdge {
  const point = (step: number): Vec3 => {
    const angle = ((fromDeg + ((toDeg - fromDeg) * step) / segments) * Math.PI) / 180;
    return [centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle), centre[2]];
  };
  const polyline: number[] = [];
  for (let step = 0; step < segments; step++) polyline.push(...point(step), ...point(step + 1));
  return { edge_id: id, vertices: [], polyline };
}

export function topoOf(edges: BrepTopoEdge[], faces: Record<string, string[]> = {}): BrepTopo {
  return {
    edges,
    faces: Object.entries(faces).map(([face_id, faceEdges]) => ({ face_id, edges: faceEdges })),
  };
}

const CUBE_CORNERS: Vec3[] = [
  [0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0],
  [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10],
];

export function cubeTopo(): BrepTopo {
  const edge = (id: string, a: number, b: number) => lineEdge(id, CUBE_CORNERS[a], CUBE_CORNERS[b]);
  return topoOf(
    [
      edge("b0", 0, 1), edge("b1", 1, 2), edge("b2", 2, 3), edge("b3", 3, 0),
      edge("t0", 4, 5), edge("t1", 5, 6), edge("t2", 6, 7), edge("t3", 7, 4),
      edge("v0", 0, 4), edge("v1", 1, 5), edge("v2", 2, 6), edge("v3", 3, 7),
    ],
    {
      bottom: ["b0", "b1", "b2", "b3"],
      top: ["t0", "t1", "t2", "t3"],
      front: ["b0", "t0", "v0", "v1"],
      right: ["b1", "t1", "v1", "v2"],
      back: ["b2", "t2", "v2", "v3"],
      left: ["b3", "t3", "v3", "v0"],
    },
  );
}

const HALF = 10;
const RADIUS = 3;
const INNER = HALF - RADIUS;

function roundedLoop(prefix: string, z: number, segments: number): BrepTopoEdge[] {
  return [
    lineEdge(`${prefix}-s`, [-INNER, -HALF, z], [INNER, -HALF, z]),
    arcEdge(`${prefix}-se`, [INNER, -INNER, z], RADIUS, -90, 0, segments),
    lineEdge(`${prefix}-e`, [HALF, -INNER, z], [HALF, INNER, z]),
    arcEdge(`${prefix}-ne`, [INNER, INNER, z], RADIUS, 0, 90, segments),
    lineEdge(`${prefix}-n`, [INNER, HALF, z], [-INNER, HALF, z]),
    arcEdge(`${prefix}-nw`, [-INNER, INNER, z], RADIUS, 90, 180, segments),
    lineEdge(`${prefix}-w`, [-HALF, INNER, z], [-HALF, -INNER, z]),
    arcEdge(`${prefix}-sw`, [-INNER, -INNER, z], RADIUS, 180, 270, segments),
  ];
}

export const ROUNDED_LOOP = ["s", "se", "e", "ne", "n", "nw", "w", "sw"];

export function roundedBoxTopo(segments = 14): BrepTopo {
  const vertical = (id: string, x: number, y: number) => lineEdge(id, [x, y, 0], [x, y, 10]);
  const loop = (prefix: string) => ROUNDED_LOOP.map((name) => `${prefix}-${name}`);
  return topoOf(
    [
      ...roundedLoop("top", 10, segments),
      ...roundedLoop("bottom", 0, segments),
      vertical("v-s-w", -INNER, -HALF), vertical("v-s-e", INNER, -HALF),
      vertical("v-e-s", HALF, -INNER), vertical("v-e-n", HALF, INNER),
      vertical("v-n-e", INNER, HALF), vertical("v-n-w", -INNER, HALF),
      vertical("v-w-n", -HALF, INNER), vertical("v-w-s", -HALF, -INNER),
    ],
    {
      top: loop("top"),
      bottom: loop("bottom"),
      south: ["top-s", "bottom-s", "v-s-w", "v-s-e"],
      "fillet-se": ["top-se", "bottom-se", "v-s-e", "v-e-s"],
      east: ["top-e", "bottom-e", "v-e-s", "v-e-n"],
      "fillet-ne": ["top-ne", "bottom-ne", "v-e-n", "v-n-e"],
      north: ["top-n", "bottom-n", "v-n-e", "v-n-w"],
      "fillet-nw": ["top-nw", "bottom-nw", "v-n-w", "v-w-n"],
      west: ["top-w", "bottom-w", "v-w-n", "v-w-s"],
      "fillet-sw": ["top-sw", "bottom-sw", "v-w-s", "v-s-w"],
    },
  );
}

export function plateWithHoleTopo(): BrepTopo {
  const cube = cubeTopo();
  return {
    edges: [
      ...cube.edges,
      arcEdge("hole-top", [5, 5, 10], 2, 0, 360, 48),
      arcEdge("hole-bottom", [5, 5, 0], 2, 0, 360, 48),
      lineEdge("hole-seam", [7, 5, 0], [7, 5, 10]),
    ],
    faces: [
      ...cube.faces.map((face) => (
        face.face_id === "top" || face.face_id === "bottom"
          ? { ...face, edges: [...face.edges, `hole-${face.face_id}`] }
          : face
      )),
      { face_id: "hole", edges: ["hole-top", "hole-bottom", "hole-seam"] },
    ],
  };
}
