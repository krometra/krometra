import type { PlaneBasis, SketchPlane } from "@/types/api";
import type { BrowserExtrudeSpan } from "./browserExtrudeExtent";

export type Vector3 = [number, number, number];

const planeBases: Record<SketchPlane, Omit<PlaneBasis, "origin">> = {
  XY: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  XZ: { u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] },
  YZ: { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
};

function vector(values: number[]): Vector3 {
  if (values.length !== 3) throw new Error("Базис эскиза должен состоять из трёх координат.");
  return [values[0], values[1], values[2]];
}

function add(origin: Vector3, direction: Vector3, distance: number): Vector3 {
  return [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance,
  ];
}

export function sketchPlaneNormal(frame: { u: Vector3; v: Vector3 }): Vector3 {
  const [ux, uy, uz] = frame.u;
  const [vx, vy, vz] = frame.v;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

export function browserPlaneFrame(input: {
  plane: SketchPlane;
  planeOffset: number;
  planeBasis: PlaneBasis | null;
  center: { x: number; y: number };
}) {
  const base = input.planeBasis ?? {
    origin: planeBases[input.plane].n.map((value) => value * input.planeOffset),
    ...planeBases[input.plane],
  };
  const u = vector(base.u);
  const v = vector(base.v);
  const n = vector(base.n);
  const origin = add(add(vector(base.origin), u, input.center.x), v, input.center.y);
  return { origin, u, v, n };
}

export function browserExtrudeFrame(
  input: Parameters<typeof browserPlaneFrame>[0],
  span: BrowserExtrudeSpan,
) {
  const frame = browserPlaneFrame(input);
  const length = span.end - span.start;
  if (!(length > 1e-9)) throw new Error("Длина выдавливания должна быть больше нуля.");
  return { ...frame, origin: add(frame.origin, frame.n, span.start), length };
}

export function browserRevolveFrame(input: {
  plane: SketchPlane;
  planeOffset: number;
  planeBasis: PlaneBasis | null;
  center: { x: number; y: number };
  axisOrigin: { x: number; y: number };
  axis: "x" | "y";
}) {
  const frame = browserPlaneFrame(input);
  const axis = input.axis === "x" ? frame.u : frame.v;
  const dx = input.axisOrigin.x - input.center.x;
  const dy = input.axisOrigin.y - input.center.y;
  const origin: Vector3 = [
    frame.origin[0] + frame.u[0] * dx + frame.v[0] * dy,
    frame.origin[1] + frame.u[1] * dx + frame.v[1] * dy,
    frame.origin[2] + frame.u[2] * dx + frame.v[2] * dy,
  ];
  return { frame, axis, origin };
}
