const COS30 = 0.8660254;

type Pt = [number, number, number];

export interface IsoView {
  scale: number;
  ox: number;
  oy: number;
}

function project(p: Pt, v: IsoView) {
  return {
    x: v.ox + v.scale * (p[0] - p[1]) * COS30,
    y: v.oy + v.scale * ((p[0] + p[1]) * 0.5 - p[2]),
  };
}

function poly(points: Pt[], v: IsoView): string {
  return points
    .map((p) => {
      const { x, y } = project(p, v);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export interface PartGeometry {
  baseTop: string;
  baseR: string;
  baseL: string;
  bossTop: string;
  bossR: string;
  bossL: string;
  holes: { cx: string; cy: string }[];
  dimPts: string;
  dimX: string;
  dimY: string;
}

// Bracket: base box 120×80×30 with a 60×40×20 boss and four corner holes.
export function buildPart(v: IsoView): PartGeometry {
  const holeCenters: [number, number][] = [
    [18, 18],
    [102, 18],
    [18, 62],
    [102, 62],
  ];
  const holes = holeCenters.map((c) => {
    const { x, y } = project([c[0], c[1], 30], v);
    return { cx: x.toFixed(1), cy: y.toFixed(1) };
  });
  const d1 = project([0, 0, -10], v);
  const d2 = project([120, 0, -10], v);
  return {
    baseTop: poly([[0, 0, 30], [120, 0, 30], [120, 80, 30], [0, 80, 30]], v),
    baseR: poly([[0, 0, 30], [120, 0, 30], [120, 0, 0], [0, 0, 0]], v),
    baseL: poly([[0, 0, 30], [0, 80, 30], [0, 80, 0], [0, 0, 0]], v),
    bossTop: poly([[30, 20, 50], [90, 20, 50], [90, 60, 50], [30, 60, 50]], v),
    bossR: poly([[30, 20, 50], [90, 20, 50], [90, 20, 30], [30, 20, 30]], v),
    bossL: poly([[30, 20, 50], [30, 60, 50], [30, 60, 30], [30, 20, 30]], v),
    holes,
    dimPts: `${d1.x.toFixed(1)},${d1.y.toFixed(1)} ${d2.x.toFixed(1)},${d2.y.toFixed(1)}`,
    dimX: ((d1.x + d2.x) / 2).toFixed(1),
    dimY: ((d1.y + d2.y) / 2 + 16).toFixed(1),
  };
}

export function buildCube(v: IsoView) {
  return {
    t: poly([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], v),
    r: poly([[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], v),
    l: poly([[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], v),
  };
}
