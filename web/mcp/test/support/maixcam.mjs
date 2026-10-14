export const PCB = {
  length: 35.56,
  width: 22.86,
  thickness: 1.0,
  cornerR: 0.6,
  pinPitch: 2.54,
  pinRowsY: [1.27, 21.59],
  pinFirstX: 1.27,
  pinHoleR: 0.45,
  pinIndexes: [6, 7, 8, 9],
  mountHoleR: 1.5,
  mountHoles: [
    [5.75, 5.17],
    [5.75, 17.69],
  ],
};

export const TOP = [
  { name: "USB-C", x: [29.2, 36.56], y: [6.96, 15.9], h: 3.96 },
  { name: "CSI FPC", x: [20.15, 23.15], y: [3.68, 19.18], h: 4.33 },
  { name: "дроссель", x: [24.27, 27.29], y: [9.89, 12.91], h: 1.8 },
];

export const BOTTOM = { name: "SoC SG2002", x: [9.83, 18.85], y: [6.92, 15.94], depth: 0.85 };

const CAMERA_PIN = 5;
const CAMERA_CENTER_X = PCB.pinFirstX + PCB.pinPitch * (CAMERA_PIN - 1);
const CAMERA_BASE_Z = 4.0;
const CAMERA_MODULE_T = 1.0;
const CAMERA_HOLDER_H = 6.05;

export const CAMERA = {
  boardX: [CAMERA_CENTER_X - 8.5, CAMERA_CENTER_X + 8.5],
  boardY: [0, PCB.width],
  posts: PCB.pinRowsY.map((y) => [CAMERA_CENTER_X, y]),
  postR: 1.2,
  baseZ: CAMERA_BASE_Z,
  boardTopZ: CAMERA_BASE_Z + CAMERA_MODULE_T,
  cutMargin: 1.0,
  holderX: [CAMERA_CENTER_X - 8.5, CAMERA_CENTER_X + 8.5],
  holderY: [PCB.width / 2 - 8.5, PCB.width / 2 + 8.5],
  holderH: CAMERA_HOLDER_H,
  holderTopZ: CAMERA_BASE_Z + CAMERA_MODULE_T + CAMERA_HOLDER_H,
};

const point = (x, y) => ({ x, y });

export const line = (x1, y1, x2, y2) => ({ type: "line", start: point(x1, y1), end: point(x2, y2) });

export const arc = (cx, cy, radius, startAngle, endAngle) => ({
  type: "arc",
  center: point(cx, cy),
  radius,
  startAngle,
  endAngle,
});

export const circle = (x, y, radius) => ({ type: "circle", center: point(x, y), radius });

export const rect = (xs, ys) => ({ type: "rectangle", corner1: point(xs[0], ys[0]), corner2: point(xs[1], ys[1]) });

export function roundedOutline(length, width, radius) {
  const r = radius;
  const half = Math.PI / 2;
  return [
    line(r, 0, length - r, 0),
    arc(length - r, r, r, 3 * half, 4 * half),
    line(length, r, length, width - r),
    arc(length - r, width - r, r, 0, half),
    line(length - r, width, r, width),
    arc(r, width - r, r, half, 2 * half),
    line(0, width - r, 0, r),
    arc(r, r, r, 2 * half, 3 * half),
  ];
}

export function pcbHoles() {
  const pins = PCB.pinRowsY.flatMap((y) =>
    PCB.pinIndexes.map((index) => circle(PCB.pinFirstX + PCB.pinPitch * index, y, PCB.pinHoleR)),
  );
  const mounts = PCB.mountHoles.map(([x, y]) => circle(x, y, PCB.mountHoleR));
  return [...pins, ...mounts];
}

export function pcbSketch() {
  return [...roundedOutline(PCB.length, PCB.width, PCB.cornerR), ...pcbHoles()];
}

export function cameraCutSketch() {
  const m = CAMERA.cutMargin;
  return [
    rect([CAMERA.boardX[0] - m, CAMERA.boardX[1] + m], [CAMERA.boardY[0] - m, CAMERA.boardY[1] + m]),
    ...CAMERA.posts.map(([x, y]) => circle(x, y, CAMERA.postR)),
  ];
}

export function entityEnds(entity) {
  if (entity.type === "line") return [entity.start, entity.end];
  if (entity.type === "arc") {
    const at = (angle) => point(
      entity.center.x + entity.radius * Math.cos(angle),
      entity.center.y + entity.radius * Math.sin(angle),
    );
    return [at(entity.startAngle), at(entity.endAngle)];
  }
  return [];
}

export const sortedLevels = (levels) => [...new Set(levels)].sort((a, b) => a - b);

export const PCB_LEVELS = sortedLevels([0, PCB.thickness]);
export const BOARD_LEVELS = sortedLevels([-BOTTOM.depth, ...PCB_LEVELS, ...TOP.map((part) => part.h)]);
export const CAMERA_LEVELS = sortedLevels([0, CAMERA.baseZ, CAMERA.boardTopZ]);
export const CAMERA_HOLDER_LEVELS = sortedLevels([...CAMERA_LEVELS, CAMERA.holderTopZ]);
