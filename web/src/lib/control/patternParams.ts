import type { PatternAxisRef } from "@/lib/bodyPattern";
import { INVALID, param, type Vec3 } from "./params";

export const PATTERN_AXIS_FORMAT =
  '{ kind: "x" | "y" | "z" } | { kind: "edge", bodyId, edgeId } | { kind: "face", bodyId, faceId } | { kind: "custom", origin: [x, y, z], direction: [x, y, z] }';

function vector(value: unknown): Vec3 | null {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [value[0], value[1], value[2]]
    : null;
}

function reference(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

export function readPatternAxis(raw: Record<string, unknown>): PatternAxisRef | typeof INVALID {
  const kind = raw.kind;
  if (kind === "x" || kind === "y" || kind === "z") return { kind };
  const bodyId = reference(raw.bodyId);
  if (kind === "edge" && bodyId && reference(raw.edgeId)) return { kind, bodyId, name: reference(raw.edgeId) as string };
  if (kind === "face" && bodyId && reference(raw.faceId)) return { kind, bodyId, name: reference(raw.faceId) as string };
  const origin = vector(raw.origin);
  const direction = vector(raw.direction);
  if (kind === "custom" && origin && direction && Math.hypot(...direction) > 1e-9) return { kind, origin, direction };
  return INVALID;
}

export function patternAxisParam(description: string) {
  return param.object(description, PATTERN_AXIS_FORMAT, readPatternAxis);
}
