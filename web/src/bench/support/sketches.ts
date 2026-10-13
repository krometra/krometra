import type { SketchConstraint, SketchEntity as SolverEntity } from "@/sketcher/solver/solveSketch";
import type { SketchEntity, SketchLine, SketchPoint } from "@/types/api";
import { circle, rectangle } from "@/workers/testing/workerHarness";
import { seededRandom, shuffled } from "./seeded";

const HOLE_PITCH = 10;
const HOLE_RADIUS = 3;

const line = (id: string, start: SketchPoint, end: SketchPoint): SketchLine => ({ id, type: "line", start, end });

function closedPolyline(prefix: string, points: SketchPoint[]): SketchEntity[] {
  return points.map((start, index) => line(`${prefix}${index}`, start, points[(index + 1) % points.length]));
}

export function plateSide(holes: number): number {
  return Math.ceil(Math.sqrt(holes)) * HOLE_PITCH;
}

export function holeGrid(holes: number): SketchEntity[] {
  const columns = Math.ceil(Math.sqrt(holes));
  return Array.from({ length: holes }, (_, index) => circle(
    `hole${index}`,
    HOLE_PITCH / 2 + (index % columns) * HOLE_PITCH,
    HOLE_PITCH / 2 + Math.floor(index / columns) * HOLE_PITCH,
    HOLE_RADIUS,
  ));
}

export function slabOutline(side: number): SketchEntity[] {
  return [rectangle("plate", 0, 0, side, side)];
}

export function perforatedPlate(holes: number): SketchEntity[] {
  return [...slabOutline(plateSide(holes)), ...holeGrid(holes)];
}

export function starContour(segments: number): SketchEntity[] {
  const points = Array.from({ length: segments }, (_, index) => {
    const radius = index % 2 === 0 ? 50 : 40;
    const angle = (2 * Math.PI * index) / segments;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  return closedPolyline("side", points);
}

export function shuffledContour(segments: number): SketchEntity[] {
  return shuffled(starContour(segments), segments);
}

export function steppedShaft(steps: number): SketchEntity[] {
  const bore = 4;
  const stepLength = 6;
  const points: SketchPoint[] = [{ x: bore, y: 0 }];
  for (let step = 0; step < steps; step++) {
    const radius = 20 - step;
    points.push({ x: radius, y: step * stepLength }, { x: radius, y: (step + 1) * stepLength });
  }
  points.push({ x: bore, y: steps * stepLength });
  return closedPolyline("shaft", points);
}

export function mixedSketch(count: number): SketchEntity[] {
  const random = seededRandom(count);
  const columns = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, index): SketchEntity => {
    const id = `entity${index}`;
    const origin = { x: (index % columns) * 20 + random() * 4, y: Math.floor(index / columns) * 20 + random() * 4 };
    const kind = index % 10;
    if (kind === 7) return rectangle(id, origin.x, origin.y, origin.x + 12, origin.y + 8);
    if (kind === 8) return circle(id, origin.x, origin.y, 3 + random() * 4);
    if (kind === 9) return { id, type: "arc", center: origin, radius: 6, startAngle: 0, endAngle: Math.PI / 2 + random() };
    const angle = kind < 3 ? (index % 2) * (Math.PI / 2) : random() * Math.PI;
    const end = { x: origin.x + 15 * Math.cos(angle), y: origin.y + 15 * Math.sin(angle) };
    return { ...line(id, origin, end), construction: kind === 6 };
  });
}

interface ConstrainedSketch {
  entities: SolverEntity[];
  constraints: SketchConstraint[];
}

export function constrainedSketch(count: number): ConstrainedSketch {
  const random = seededRandom(count);
  const jitter = () => (random() - 0.5) * 2;
  const circles = Math.max(1, Math.floor(count / 10));
  const lines = count - circles;
  const step = 10;
  const corner = (index: number): SketchPoint => ({
    x: Math.floor((index + 1) / 2) * step + jitter(),
    y: Math.floor(index / 2) * step + jitter(),
  });
  const entities: SolverEntity[] = [];
  const constraints: SketchConstraint[] = [];
  const constrain = (type: SketchConstraint["type"], anchors: [string, number][], value: number | null = null) => {
    constraints.push({
      id: `constraint${constraints.length}`,
      type,
      anchors: anchors.map(([entity_id, sub_index]) => ({ entity_id, sub_index })),
      value,
    });
  };
  for (let index = 0; index < lines; index++) {
    const id = `line${index}`;
    entities.push({ id, type: "line", start: corner(index), end: corner(index + 1) });
    constrain(index % 2 === 0 ? "horizontal" : "vertical", [[id, 0]]);
    if (index > 0) constrain("coincident", [[`line${index - 1}`, 1], [id, 0]]);
    if (index % 4 === 0) constrain("distance", [[id, 0], [id, 1]], step);
    if (index % 8 === 2) constrain("equal", [[`line${index - 2}`, 0], [id, 0]]);
  }
  for (let index = 0; index < circles; index++) {
    const id = `circle${index}`;
    entities.push({ id, type: "circle", center: { x: index * step, y: -20 }, radius: 3 + random() * 2 });
    constrain("radius", [[id, 0]], 4);
  }
  return { entities, constraints };
}
