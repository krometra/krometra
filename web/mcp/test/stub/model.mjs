export const CANVAS = { left: 240, top: 56, width: 800, height: 600, pixelRatio: 2 };
export const BACKGROUND = "#20262e";
export const BODY_ID = "body-1";
export const HOME_TARGET = [0, 0, 0];

const ZOOM = 6;
const HALF_SIZE = [20, 15, 10];

export function projectPoint([x, y, z], target) {
  const [dx, dy, dz] = [x - target[0], y - target[1], z - target[2]];
  return [
    CANVAS.left + CANVAS.width / 2 + (dx - dy * 0.5) * ZOOM,
    CANVAS.top + CANVAS.height / 2 - (dz + dy * 0.35) * ZOOM,
  ];
}

const corner = (index) => HALF_SIZE.map((half, axis) => ((index >> axis) & 1 ? half : -half));

const midpoint = (a, b) => a.map((value, axis) => (value + b[axis]) / 2);

function boxEdges() {
  const edges = [];
  for (let from = 0; from < 8; from += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const to = from | (1 << axis);
      if (to === from) continue;
      const [start, end] = [corner(from), corner(to)];
      edges.push({
        id: `e-k${from}x${to}q7m2`,
        start,
        end,
        midpoint: midpoint(start, end),
        length: HALF_SIZE[axis] * 2,
        closed: false,
      });
    }
  }
  return edges;
}

function boxFace(axis, side) {
  const centroid = HALF_SIZE.map((half, at) => (at === axis ? side * half : 0));
  return {
    id: `f-p${axis}s${side + 1}w4z8`,
    planar: true,
    normal: HALF_SIZE.map((_, at) => (at === axis ? side : 0)),
    centroid,
    point: centroid.map((value, at) => (at === axis ? value : HALF_SIZE[at] / 4)),
  };
}

export function boxTopology() {
  const faces = [0, 1, 2].flatMap((axis) => [-1, 1].map((side) => boxFace(axis, side)));
  return { bodyId: BODY_ID, faces, edges: boxEdges() };
}

const EXPORT_MIME = { stl: "model/stl", step: "application/step" };
const BINARY_TAIL = [0, 255, 128, 13, 10, 26];

export function stubExportFile(format, bodyIds) {
  if (!Object.hasOwn(EXPORT_MIME, format)) return null;
  const header = `${format} export of ${bodyIds ? bodyIds.join(",") : "all visible bodies"}\n`;
  return {
    mime: EXPORT_MIME[format],
    filename: `stub-project${bodyIds ? `-${bodyIds.join("-")}` : ""}.${format}`,
    bytes: [...new TextEncoder().encode(header), ...BINARY_TAIL],
  };
}
