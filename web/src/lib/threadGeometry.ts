export type Vec3 = [number, number, number];
export type ProfilePoint = [radius: number, along: number];
export type Triangle = [Vec3, Vec3, Vec3];

export const SEGMENTS_PER_TURN = 24;
export const SEGMENT_ARC_RATIO = 0.26;
export const MAX_SEGMENTS_PER_TURN = 64;
export const OVERSHOOT_RATIO = 0.06;
export const OVERSHOOT_MARGIN = 1.35;
export const ISO_DEPTH_RATIO = 0.613;
const MAX_CREST_RATIO = 0.98;

export class ThreadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ThreadError";
  }
}

export interface ThreadCylinderInfo {
  radius: number;
  origin: Vec3;
  direction: Vec3;
  start: number;
  length: number;
  external: boolean;
}

export interface ThreadOptions {
  pitch: number;
  depth?: number | null;
  length?: number | null;
  offset: number;
  crestRatio: number;
  starts: number;
  rightHanded: boolean;
}

export interface ThreadPlan {
  pitch: number;
  depth: number;
  length: number;
  offset: number;
  lead: number;
  starts: number;
  crestRatio: number;
  rightHanded: boolean;
  toolStart: number;
  toolLength: number;
  clipFrom: number;
  clipTo: number;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function isoDepth(pitch: number): number {
  return pitch * ISO_DEPTH_RATIO;
}

export function segmentsFor(radius: number): number {
  const byArc = radius > 0 ? Math.ceil((2 * Math.PI) / SEGMENT_ARC_RATIO) : SEGMENTS_PER_TURN;
  return Math.max(SEGMENTS_PER_TURN, Math.min(MAX_SEGMENTS_PER_TURN, byArc));
}

export function threadOvershoot(radius: number, depth: number, segmentsPerTurn: number): number {
  const sagitta = radius * (1 - Math.cos(Math.PI / segmentsPerTurn));
  return Math.max(depth * OVERSHOOT_RATIO, sagitta * OVERSHOOT_MARGIN);
}

export function threadProfile(
  radius: number,
  depth: number,
  pitch: number,
  external: boolean,
  crestRatio: number,
  overshoot: number,
): ProfilePoint[] {
  const sign = external ? -1 : 1;
  const outer = radius - sign * overshoot;
  const tip = radius + sign * depth;
  const half = pitch / 2;
  if (crestRatio <= 1e-6) return [[outer, -half], [outer, half], [tip, 0]];
  const crestHalf = half * Math.min(crestRatio, MAX_CREST_RATIO);
  return [[outer, -half], [outer, half], [tip, crestHalf], [tip, -crestHalf]];
}

export function axisBasis(direction: Vec3): { u: Vec3; v: Vec3 } {
  const seed: Vec3 = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(seed, direction));
  return { u, v: cross(direction, u) };
}

export function axialExtent(points: Vec3[], origin: Vec3, direction: Vec3): [number, number] {
  const projections = points.map((point) => dot(subtract(point, origin), direction));
  return [Math.min(...projections), Math.max(...projections)];
}

export function orientCylinderAxis(direction: Vec3, extent: [number, number]): { direction: Vec3; start: number; end: number } {
  if (extent[1] > 0) return { direction, start: extent[0], end: extent[1] };
  return { direction: direction.map((component) => 0 - component) as Vec3, start: 0 - extent[1], end: 0 - extent[0] };
}

export function isOutwardNormal(point: Vec3, normal: Vec3, origin: Vec3, direction: Vec3): boolean {
  const offset = subtract(point, origin);
  const along = dot(offset, direction);
  const radial = subtract(offset, [direction[0] * along, direction[1] * along, direction[2] * along]);
  return dot(radial, normal) > 0;
}

export function pointsOnCylinder(points: Vec3[], cylinder: ThreadCylinderInfo, tolerance: number): boolean {
  if (points.length === 0) return false;
  return points.every((point) => {
    const offset = subtract(point, cylinder.origin);
    const along = dot(offset, cylinder.direction);
    const radial = Math.hypot(...subtract(offset, cylinder.direction.map((c) => c * along) as Vec3));
    const withinLength = along >= cylinder.start - tolerance && along <= cylinder.start + cylinder.length + tolerance;
    return withinLength && Math.abs(radial - cylinder.radius) <= tolerance;
  });
}

function validatePlan(cylinder: ThreadCylinderInfo, plan: Pick<ThreadPlan, "pitch" | "depth" | "length" | "starts" | "crestRatio">) {
  if (!(plan.pitch > 0)) throw new ThreadError("bad_pitch", "Шаг резьбы должен быть больше нуля.");
  if (!(plan.depth > 0)) throw new ThreadError("bad_depth", "Глубина резьбы должна быть больше нуля.");
  if (!(plan.starts >= 1)) throw new ThreadError("bad_starts", "Число заходов резьбы — минимум 1.");
  if (!(plan.crestRatio >= 0 && plan.crestRatio < 1)) {
    throw new ThreadError("bad_crest", "Ширина вершины профиля задаётся долей шага от 0 до 1.");
  }
  const lead = plan.pitch * plan.starts;
  if (plan.length < lead) {
    throw new ThreadError(
      "length_too_small",
      `Длина резьбы ${plan.length} мм меньше подъёма за оборот (${lead} мм) — виток не поместится.`,
    );
  }
  if (plan.length > cylinder.length + 1e-6) {
    throw new ThreadError(
      "length_too_large",
      `Длина резьбы ${plan.length} мм больше длины цилиндрической грани (${cylinder.length.toFixed(2)} мм).`,
    );
  }
  if (cylinder.external && plan.depth >= cylinder.radius) {
    throw new ThreadError(
      "depth_too_large",
      `Глубина резьбы ${plan.depth} мм не меньше радиуса стержня (${cylinder.radius.toFixed(2)} мм) — резьба срежет его целиком.`,
    );
  }
}

export function resolveThreadPlan(cylinder: ThreadCylinderInfo, options: ThreadOptions): ThreadPlan {
  const depth = options.depth ?? isoDepth(options.pitch);
  const length = options.length ?? cylinder.length - options.offset;
  const starts = Math.round(options.starts);
  validatePlan(cylinder, { pitch: options.pitch, depth, length, starts, crestRatio: options.crestRatio });
  const lead = options.pitch * starts;
  const clipFrom = cylinder.start + options.offset;
  return {
    pitch: options.pitch,
    depth,
    length,
    offset: options.offset,
    lead,
    starts,
    crestRatio: options.crestRatio,
    rightHanded: options.rightHanded,
    toolStart: clipFrom - lead / 2,
    toolLength: length + lead,
    clipFrom,
    clipTo: clipFrom + length,
  };
}

export function helixRings(cylinder: ThreadCylinderInfo, plan: ThreadPlan, startAngle: number): Vec3[][] {
  const segmentsPerTurn = segmentsFor(cylinder.radius);
  const turns = plan.toolLength / plan.lead;
  const steps = Math.max(3, Math.round(segmentsPerTurn * turns));
  const overshoot = threadOvershoot(cylinder.radius, plan.depth, segmentsPerTurn);
  const profile = threadProfile(cylinder.radius, plan.depth, plan.pitch, cylinder.external, plan.crestRatio, overshoot);
  const winding = plan.rightHanded ? 1 : -1;
  const { u, v } = axisBasis(cylinder.direction);
  const { origin: o, direction: d } = cylinder;

  const rings: Vec3[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i * turns) / steps;
    const angle = startAngle + winding * 2 * Math.PI * t;
    const along = plan.toolStart + plan.lead * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    rings.push(profile.map(([r, dz]) => [0, 1, 2].map((axis) => (
      o[axis] + d[axis] * (along + dz) + r * (u[axis] * cos + v[axis] * sin)
    )) as Vec3));
  }
  return rings;
}

function capTriangles(ring: Vec3[]): Triangle[] {
  const triangles: Triangle[] = [];
  for (let k = 1; k < ring.length - 1; k++) triangles.push([ring[0], ring[k], ring[k + 1]]);
  return triangles;
}

export function helixTriangles(rings: Vec3[][]): Triangle[] {
  const triangles: Triangle[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    for (let k = 0; k < a.length; k++) {
      const j = (k + 1) % a.length;
      triangles.push([a[k], a[j], b[j]], [a[k], b[j], b[k]]);
    }
  }
  return [...triangles, ...capTriangles(rings[0]), ...capTriangles(rings[rings.length - 1])];
}

export function startAngles(starts: number): number[] {
  return Array.from({ length: starts }, (_, index) => (2 * Math.PI * index) / starts);
}

export function threadLabel(external: boolean, diameter: number, pitch: number, starts: number): string {
  const kind = external ? "Внешняя" : "Внутренняя";
  const suffix = starts > 1 ? `, ${starts} захода` : "";
  return `${kind} резьба M${diameter.toFixed(0)}×${pitch}${suffix}`;
}
