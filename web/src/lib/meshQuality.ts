export interface MeshTolerance {
  tolerance: number;
  angularTolerance: number;
}

export type QualityPreset = "draft" | "normal" | "high" | "custom";

export interface CustomQuality {
  tolerance: number;
  angleDeg: number;
}

export interface QualityChoice {
  preset: QualityPreset;
  custom: CustomQuality;
}

export const TOLERANCE_RANGE = { min: 0.0005, max: 5 };
export const ANGLE_RANGE_DEG = { min: 1, max: 90 };

export const QUALITY_PRESETS: Record<Exclude<QualityPreset, "custom">, CustomQuality> = {
  draft: { tolerance: 0.1, angleDeg: 30 },
  normal: { tolerance: 0.01, angleDeg: (0.5 * 180) / Math.PI },
  high: { tolerance: 0.002, angleDeg: 6 },
};

export const QUALITY_LABELS: Record<QualityPreset, string> = {
  draft: "Черновое",
  normal: "Нормальное",
  high: "Высокое",
  custom: "Своё",
};

export function roundedQuality(values: CustomQuality): CustomQuality {
  return { tolerance: Number(values.tolerance.toFixed(4)), angleDeg: Number(values.angleDeg.toFixed(1)) };
}

export function defaultQuality(): QualityChoice {
  return { preset: "normal", custom: roundedQuality(QUALITY_PRESETS.normal) };
}

const STL_HEADER_BYTES = 84;
const STL_TRIANGLE_BYTES = 50;

function inRange(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= range.min && value <= range.max;
}

export function customQualityError(custom: CustomQuality): string | null {
  if (!inRange(custom.tolerance, TOLERANCE_RANGE)) {
    return `Линейный допуск — от ${TOLERANCE_RANGE.min} до ${TOLERANCE_RANGE.max} мм.`;
  }
  if (!inRange(custom.angleDeg, ANGLE_RANGE_DEG)) {
    return `Угловой допуск — от ${ANGLE_RANGE_DEG.min} до ${ANGLE_RANGE_DEG.max}°.`;
  }
  return null;
}

export function qualityValues(choice: QualityChoice): CustomQuality {
  return choice.preset === "custom" ? choice.custom : QUALITY_PRESETS[choice.preset];
}

export function meshTolerance(values: CustomQuality): MeshTolerance {
  return { tolerance: values.tolerance, angularTolerance: (values.angleDeg * Math.PI) / 180 };
}

function isPreset(value: unknown): value is QualityPreset {
  return typeof value === "string" && value in QUALITY_LABELS;
}

function readCustom(value: unknown): CustomQuality {
  const raw = (value ?? {}) as Partial<CustomQuality>;
  const custom = { tolerance: raw.tolerance as number, angleDeg: raw.angleDeg as number };
  return customQualityError(custom) ? roundedQuality(QUALITY_PRESETS.normal) : roundedQuality(custom);
}

export function parseQualityChoice(raw: string | null): QualityChoice {
  try {
    const parsed = JSON.parse(raw ?? "null") as Partial<QualityChoice> | null;
    if (!parsed || !isPreset(parsed.preset)) return defaultQuality();
    return { preset: parsed.preset, custom: readCustom(parsed.custom) };
  } catch {
    return defaultQuality();
  }
}

export function explicitQuality(request: { preset?: Exclude<QualityPreset, "custom">; tolerance?: number; angleDeg?: number }): CustomQuality {
  const base = QUALITY_PRESETS[request.preset ?? "normal"];
  return { tolerance: request.tolerance ?? base.tolerance, angleDeg: request.angleDeg ?? base.angleDeg };
}

export function stlBytes(triangles: number): number {
  return STL_HEADER_BYTES + triangles * STL_TRIANGLE_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
