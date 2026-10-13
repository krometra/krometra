import type { Vec3 } from "@/lib/threadGeometry";
import { fail, type ControlParamDescriptor, type ControlParamType } from "./protocol";

export type Vec2 = [number, number];
export type { Vec3 };

export const INVALID = Symbol("invalid-param");

type Read<T> = (value: unknown) => T | typeof INVALID;

export interface ParamSpec<T> extends ControlParamDescriptor {
  expected: string;
  read: Read<T>;
}

export type ParamSchema = Record<string, ParamSpec<unknown>>;

export type ParamsOf<S extends ParamSchema> = {
  [K in keyof S]: S[K] extends ParamSpec<infer T> ? T : never;
};

interface NumberRange {
  min?: number;
  max?: number;
  above?: number;
}

function spec<T>(type: ControlParamType, description: string, expected: string, read: Read<T>): ParamSpec<T> {
  return { type, required: true, description, expected, read };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inRange(value: number, range: NumberRange): boolean {
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  if (range.above !== undefined && !(value > range.above)) return false;
  return true;
}

function rangeText(range: NumberRange): string {
  const parts: string[] = [];
  if (range.above !== undefined) parts.push(`больше ${range.above}`);
  if (range.min !== undefined) parts.push(`не меньше ${range.min}`);
  if (range.max !== undefined) parts.push(`не больше ${range.max}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function vector<T extends number[]>(size: number, description: string): ParamSpec<T> {
  return spec<T>("array", description, `массив из ${size} чисел`, (value) =>
    Array.isArray(value) && value.length === size && value.every(isFiniteNumber) ? ([...value] as T) : INVALID,
  );
}

export const param = {
  string(description: string): ParamSpec<string> {
    return spec("string", description, "непустая строка", (value) =>
      typeof value === "string" && value.length > 0 ? value : INVALID,
    );
  },

  id(description: string): ParamSpec<string> {
    return spec("string", description, "идентификатор (строка или число)", (value) => {
      if (typeof value === "string" && value.length > 0) return value;
      return isFiniteNumber(value) ? String(value) : INVALID;
    });
  },

  oneOf<const T extends string>(values: readonly T[], description: string): ParamSpec<T> {
    const listed = values.join(" | ");
    return spec("string", `${description} Допустимо: ${listed}.`, `одно из значений: ${listed}`, (value) =>
      typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : INVALID,
    );
  },

  number(description: string, range: NumberRange = {}): ParamSpec<number> {
    return spec("number", description, `число${rangeText(range)}`, (value) =>
      isFiniteNumber(value) && inRange(value, range) ? value : INVALID,
    );
  },

  integer(description: string, range: NumberRange = {}): ParamSpec<number> {
    return spec("integer", description, `целое число${rangeText(range)}`, (value) =>
      isFiniteNumber(value) && Number.isInteger(value) && inRange(value, range) ? value : INVALID,
    );
  },

  boolean(description: string): ParamSpec<boolean> {
    return spec("boolean", description, "true или false", (value) => (typeof value === "boolean" ? value : INVALID));
  },

  vec2(description: string): ParamSpec<Vec2> {
    return vector<Vec2>(2, description);
  },

  vec3(description: string): ParamSpec<Vec3> {
    return vector<Vec3>(3, description);
  },

  list<T>(item: ParamSpec<T>, description: string, minLength = 1): ParamSpec<T[]> {
    return spec("array", description, `массив (не короче ${minLength}), элемент — ${item.expected}`, (value) => {
      if (!Array.isArray(value) || value.length < minLength) return INVALID;
      const items = value.map((entry) => item.read(entry));
      return items.includes(INVALID) ? INVALID : (items as T[]);
    });
  },

  object<T>(description: string, expected: string, read: (value: Record<string, unknown>) => T | typeof INVALID): ParamSpec<T> {
    return spec("object", description, expected, (value) => (isPlainObject(value) ? read(value) : INVALID));
  },

  optional<T>(inner: ParamSpec<T>): ParamSpec<T | undefined> {
    return { ...inner, required: false };
  },
};

export function describeParams(schema: ParamSchema): Record<string, ControlParamDescriptor> {
  return Object.fromEntries(
    Object.entries(schema).map(([name, { type, required, description }]) => [name, { type, required, description }]),
  );
}

function paramsObject(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) throw fail("invalid_params", "Поле params должно быть объектом.");
  return raw;
}

export function parseParams<S extends ParamSchema>(schema: S, raw: unknown): ParamsOf<S> {
  const input = paramsObject(raw);
  const allowed = Object.keys(schema);
  const unknown = Object.keys(input).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) {
    throw fail(
      "invalid_params",
      `Неизвестные параметры: ${unknown.join(", ")}. Допустимые: ${allowed.join(", ") || "параметров нет"}.`,
    );
  }

  const parsed: Record<string, unknown> = {};
  for (const name of allowed) {
    const declared = schema[name];
    const value = input[name];
    if (value === undefined || value === null) {
      if (declared.required) {
        throw fail("invalid_params", `Не задан обязательный параметр «${name}»: ${declared.expected}.`);
      }
      continue;
    }
    const result = declared.read(value);
    if (result === INVALID) {
      throw fail("invalid_params", `Параметр «${name}»: ожидается ${declared.expected}.`);
    }
    parsed[name] = result;
  }
  return parsed as ParamsOf<S>;
}
