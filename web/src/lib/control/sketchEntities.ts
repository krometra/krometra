import type { SketchArc, SketchCircle, SketchEntity, SketchLine, SketchPoint, SketchRectangle } from "@/types/api";
import { INVALID, isPlainObject, param, type ParamSpec } from "./params";
import { fail } from "./protocol";

type WithOptionalId<T extends { id: string }> = Omit<T, "id"> & { id?: string };

export type SketchEntityInput =
  | WithOptionalId<SketchLine>
  | WithOptionalId<SketchRectangle>
  | WithOptionalId<SketchCircle>
  | WithOptionalId<SketchArc>;

export const SKETCH_ENTITY_FORMAT =
  'объект { type: "line", start: {x,y}, end: {x,y} } | { type: "rectangle", corner1: {x,y}, corner2: {x,y} } | ' +
  '{ type: "circle", center: {x,y}, radius } | { type: "arc", center: {x,y}, radius, startAngle, endAngle }; ' +
  "координаты в мм в системе эскиза, углы в радианах против часовой стрелки; необязательные поля: id, construction (для line и circle)";

const MIN_SIZE = 1e-9;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function point(value: unknown): SketchPoint | null {
  if (!isPlainObject(value) || !finite(value.x) || !finite(value.y)) return null;
  return { x: value.x, y: value.y };
}

function explicitId(raw: Record<string, unknown>): { id?: string } | null {
  if (raw.id === undefined) return {};
  return typeof raw.id === "string" && raw.id.length > 0 ? { id: raw.id } : null;
}

function construction(raw: Record<string, unknown>): { construction?: boolean } | null {
  if (raw.construction === undefined) return {};
  return typeof raw.construction === "boolean" ? { construction: raw.construction } : null;
}

function readLine(raw: Record<string, unknown>): SketchEntityInput | null {
  const start = point(raw.start);
  const end = point(raw.end);
  const flags = construction(raw);
  if (!start || !end || !flags) return null;
  if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_SIZE) return null;
  return { type: "line", start, end, ...flags };
}

function readRectangle(raw: Record<string, unknown>): SketchEntityInput | null {
  const corner1 = point(raw.corner1);
  const corner2 = point(raw.corner2);
  if (!corner1 || !corner2) return null;
  if (Math.abs(corner2.x - corner1.x) < MIN_SIZE || Math.abs(corner2.y - corner1.y) < MIN_SIZE) return null;
  return { type: "rectangle", corner1, corner2 };
}

function readCircle(raw: Record<string, unknown>): SketchEntityInput | null {
  const center = point(raw.center);
  const flags = construction(raw);
  if (!center || !flags || !finite(raw.radius) || raw.radius < MIN_SIZE) return null;
  return { type: "circle", center, radius: raw.radius, ...flags };
}

function readArc(raw: Record<string, unknown>): SketchEntityInput | null {
  const center = point(raw.center);
  if (!center || !finite(raw.radius) || raw.radius < MIN_SIZE) return null;
  if (!finite(raw.startAngle) || !finite(raw.endAngle) || Math.abs(raw.endAngle - raw.startAngle) < MIN_SIZE) return null;
  return { type: "arc", center, radius: raw.radius, startAngle: raw.startAngle, endAngle: raw.endAngle };
}

const READERS = new Map<unknown, (raw: Record<string, unknown>) => SketchEntityInput | null>([
  ["line", readLine],
  ["rectangle", readRectangle],
  ["circle", readCircle],
  ["arc", readArc],
]);

function readSketchEntityInput(raw: Record<string, unknown>): SketchEntityInput | typeof INVALID {
  const reader = READERS.get(raw.type);
  const id = explicitId(raw);
  const entity = reader?.(raw);
  return entity && id ? { ...entity, ...id } : INVALID;
}

export function sketchEntitiesParam(description: string): ParamSpec<SketchEntityInput[]> {
  return param.list(param.object(description, SKETCH_ENTITY_FORMAT, readSketchEntityInput), description);
}

export function assignEntityIds(inputs: SketchEntityInput[], takenIds: Iterable<string>, stamp: number): SketchEntity[] {
  const taken = new Set(takenIds);
  let counter = 0;
  return inputs.map((input) => {
    let id = input.id;
    if (id !== undefined && taken.has(id)) {
      throw fail("invalid_params", `Сущность с id «${id}» уже есть в эскизе.`);
    }
    while (id === undefined || taken.has(id)) id = `control-entity-${stamp}-${++counter}`;
    taken.add(id);
    return { ...input, id } as SketchEntity;
  });
}
