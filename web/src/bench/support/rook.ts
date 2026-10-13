import type { SketchEntity } from "@/types/api";
import { extrudeRequest, type WorkerReply } from "@/workers/testing/workerHarness";

type RadiusHeight = [radius: number, height: number];

export interface CylinderTarget {
  axisX: number;
  radius: number;
  zFrom: number;
  zTo: number;
}

const TOWER_PROFILE: RadiusHeight[] = [
  [0, 0], [23.4, 0], [24, 0.6], [24, 5], [19, 10], [17, 54], [19, 56], [19, 59.4],
  [18.4, 60], [13.85, 60], [12.85, 59], [12.85, 50], [12, 50], [12, 3], [0, 3],
];

const CROWN_PROFILE: RadiusHeight[] = [
  [0, 0], [19.4, 0], [20, 0.6], [20, 10], [17, 13], [17, 15],
  [13.75, 15], [13.75, 23.2], [12.95, 24], [10, 24], [10, 12], [0, 12],
];

const CROWN_AXIS_X = 70;
const SLOTS = { count: 6, halfWidth: 2.5, innerRadius: 12, outerRadius: 22, depth: 4 };
const THREAD = { pitch: 3, depth: 1.35, length: null, offset: 0, crestRatio: 0.1, starts: 1, rightHanded: true };
const FACE_TOLERANCE = 0.05;

export const TOWER_BORE: CylinderTarget = { axisX: 0, radius: 12.85, zFrom: 50, zTo: 59 };
export const CROWN_PLUG: CylinderTarget = { axisX: CROWN_AXIS_X, radius: 13.75, zFrom: 15, zTo: 23.2 };

function closedLoop(prefix: string, points: [number, number][]): SketchEntity[] {
  return points.map(([x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return { id: `${prefix}${index}`, type: "line", start: { x, y }, end: { x: nextX, y: nextY } };
  });
}

function revolveRequest(featureKey: string, profile: RadiusHeight[], axisX: number) {
  return {
    kind: "revolve",
    entities: closedLoop(featureKey, profile.map(([radius, height]) => [axisX + radius, height])),
    plane: "XZ",
    planeOffset: 0,
    planeBasis: null,
    axisOrigin: { x: axisX, y: 0 },
    axis: "y",
    angle: 360,
    direction: "one_side",
    featureKey,
  };
}

export function towerRevolve() {
  return revolveRequest("k-rook-tower", TOWER_PROFILE, 0);
}

export function crownRevolve() {
  return revolveRequest("k-rook-crown", CROWN_PROFILE, CROWN_AXIS_X);
}

function slotLines(): SketchEntity[] {
  return Array.from({ length: SLOTS.count }, (_, slot) => {
    const angle = (slot * 2 * Math.PI) / SLOTS.count;
    const along = [Math.cos(angle), Math.sin(angle)];
    const corner = (radius: number, side: number): [number, number] => [
      CROWN_AXIS_X + along[0] * radius - along[1] * side,
      along[1] * radius + along[0] * side,
    ];
    return closedLoop(`slot${slot}-`, [
      corner(SLOTS.innerRadius, -SLOTS.halfWidth),
      corner(SLOTS.outerRadius, -SLOTS.halfWidth),
      corner(SLOTS.outerRadius, SLOTS.halfWidth),
      corner(SLOTS.innerRadius, SLOTS.halfWidth),
    ]);
  }).flat();
}

export function slotCut(targetBodyId: string) {
  return extrudeRequest(slotLines(), "k-rook-slots", { distance: SLOTS.depth, operation: "cut", targetBodyId });
}

export function threadRequest(bodyId: string, faceId: string, featureKey: string) {
  return { kind: "thread", bodyId, faceId, facePoints: [], options: THREAD, featureKey };
}

function faceBounds(reply: WorkerReply) {
  const mesh = reply.mesh;
  const bounds = new Map<string, { min: number[]; max: number[] }>();
  if (!mesh) return bounds;
  mesh.face_triangle_map.forEach((face, triangle) => {
    const name = String(face);
    const box = bounds.get(name) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let corner = 0; corner < 3; corner++) {
      const vertex = mesh.indices[triangle * 3 + corner] * 3;
      for (let axis = 0; axis < 3; axis++) {
        box.min[axis] = Math.min(box.min[axis], mesh.vertices[vertex + axis]);
        box.max[axis] = Math.max(box.max[axis], mesh.vertices[vertex + axis]);
      }
    }
    bounds.set(name, box);
  });
  return bounds;
}

export function cylinderFace(reply: WorkerReply, target: CylinderTarget): string {
  const near = (a: number, b: number) => Math.abs(a - b) < FACE_TOLERANCE;
  for (const [name, { min, max }] of faceBounds(reply)) {
    const radial = near(max[0] - target.axisX, target.radius) && near(target.axisX - min[0], target.radius);
    if (radial && near(min[2], target.zFrom) && near(max[2], target.zTo)) return name;
  }
  throw new Error(`Нет цилиндрической грани R${target.radius} на z ${target.zFrom}..${target.zTo}.`);
}
