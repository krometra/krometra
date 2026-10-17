import type { SketchArc, SketchCircle, SketchEntity, SketchLine, SketchPoint, SketchRectangle } from "@/types/api";
import { INVALID, isPlainObject, type ParamSpec } from "./params";
import { fail } from "./protocol";
import { circularPattern, linearPattern } from "./sketchPatterns";

type WithOptionalId<T extends { id: string }> = Omit<T, "id"> & { id?: string };

export type SketchEntityInput =
  | WithOptionalId<SketchLine>
  | WithOptionalId<SketchRectangle>
  | WithOptionalId<SketchCircle>
  | WithOptionalId<SketchArc>;

export const SKETCH_ENTITY_FORMAT =
  'объект { type: "line", start: {x,y}, end: {x,y} } | { type: "rectangle", corner1: {x,y}, corner2: {x,y} } | ' +
  '{ type: "circle", center: {x,y}, radius } | { type: "arc", center: {x,y}, radius, startAngle, endAngle }; ' +
  "координаты в мм в системе эскиза, углы в радианах против часовой стрелки; необязательные поля: id, construction (true - вспомогательная геометрия: рисуется пунктиром, ловится привязкой, в профиль не входит). " +
  'Массивы: { type: "linear_pattern", entities: [...], count, step: {x,y}, count2?, step2?: {x,y} } — сетка count × count2 копий со сдвигами step и step2; ' +
  '{ type: "circular_pattern", entities: [...], count, center: {x,y}, angle? } — count копий по окружности вокруг center, angle — общий угол в радианах (по умолчанию полный круг). ' +
  "Первая копия — сами entities, у копий с id к нему добавляется -1, -2 и т. д.; массивы можно вкладывать";

const MAX_PATTERN_COUNT = 500;
const MAX_ENTITIES = 2000;
const MAX_PATTERN_DEPTH = 3;

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
  const flags = construction(raw);
  if (!corner1 || !corner2 || !flags) return null;
  if (Math.abs(corner2.x - corner1.x) < MIN_SIZE || Math.abs(corner2.y - corner1.y) < MIN_SIZE) return null;
  return { type: "rectangle", corner1, corner2, ...flags };
}

function readCircle(raw: Record<string, unknown>): SketchEntityInput | null {
  const center = point(raw.center);
  const flags = construction(raw);
  if (!center || !flags || !finite(raw.radius) || raw.radius < MIN_SIZE) return null;
  return { type: "circle", center, radius: raw.radius, ...flags };
}

function readArc(raw: Record<string, unknown>): SketchEntityInput | null {
  const center = point(raw.center);
  const flags = construction(raw);
  if (!center || !flags || !finite(raw.radius) || raw.radius < MIN_SIZE) return null;
  if (!finite(raw.startAngle) || !finite(raw.endAngle) || Math.abs(raw.endAngle - raw.startAngle) < MIN_SIZE) return null;
  return { type: "arc", center, radius: raw.radius, startAngle: raw.startAngle, endAngle: raw.endAngle, ...flags };
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

function patternCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_PATTERN_COUNT ? value : null;
}

function readPattern(raw: Record<string, unknown>, depth: number): SketchEntityInput[] | null {
  const inner = readItems(raw.entities, depth + 1);
  const count = patternCount(raw.count);
  if (inner === null || count === null) return null;
  if (raw.type === "circular_pattern") {
    const center = point(raw.center);
    if (!center || (raw.angle !== undefined && !finite(raw.angle))) return null;
    return circularPattern(inner, { count, center, angle: raw.angle as number | undefined });
  }
  const step = point(raw.step);
  const count2 = raw.count2 === undefined ? 1 : patternCount(raw.count2);
  const step2 = raw.step2 === undefined ? { x: 0, y: 0 } : point(raw.step2);
  if (!step || count2 === null || !step2) return null;
  return linearPattern(inner, { count, step, count2, step2 });
}

function readItem(raw: unknown, depth: number): SketchEntityInput[] | null {
  if (!isPlainObject(raw)) return null;
  if (raw.type === "linear_pattern" || raw.type === "circular_pattern") {
    return depth < MAX_PATTERN_DEPTH ? readPattern(raw, depth) : null;
  }
  const entity = readSketchEntityInput(raw);
  return entity === INVALID ? null : [entity];
}

function readItems(value: unknown, depth: number): SketchEntityInput[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const result: SketchEntityInput[] = [];
  for (const raw of value) {
    const items = readItem(raw, depth);
    if (!items || result.length + items.length > MAX_ENTITIES) return null;
    result.push(...items);
  }
  return result;
}

export function sketchEntitiesParam(description: string): ParamSpec<SketchEntityInput[]> {
  return {
    type: "array",
    required: true,
    description,
    expected: `непустой массив (не больше ${MAX_ENTITIES} сущностей после раскрытия массивов), элемент — ${SKETCH_ENTITY_FORMAT}`,
    read: (value) => readItems(value, 0) ?? INVALID,
  };
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
