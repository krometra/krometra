import {
  formatMegabytes,
  MAX_BODY_STEP_BYTES,
  MAX_IMPORT_BODIES,
  MAX_IMPORT_FILE_BYTES,
  MAX_KERNEL_BODIES,
  MAX_KERNEL_MODEL_BYTES,
  type KernelLedgerTotals,
} from "./browserKernel";
import { generatedFaceName, nameEdges, stableHash, type BodyNaming, type Fingerprint, type TopologySnapshot } from "./browserNaming";
import { pluralize } from "./plural";

export const IMPORT_EMPTY_FILE = "Файл пуст — выберите другой STEP-файл.";
export const IMPORT_UNREADABLE = "Не удалось прочитать STEP-файл: он повреждён или это не STEP.";
export const IMPORT_NO_BODIES = "В STEP-файле нет твёрдых тел.";
export const IMPORT_SURFACES_ONLY = "В STEP-файле только поверхности без твёрдых тел — импорт поверхностей пока не поддерживается.";

const FINGERPRINT_QUANTUM = 1e-4;
const STEP_EXTENSION = /\.(step|stp)$/i;

function fingerprintKey(fingerprint: Fingerprint): string {
  return fingerprint.map((value) => Math.round(value / FINGERPRINT_QUANTUM) + 0).join(",");
}

export function geometryFaceNames(faces: Fingerprint[]): string[] {
  const keys = faces.map(fingerprintKey);
  const bodyKey = `import-${stableHash([...keys].sort().join(";"))}`;
  const repeats = new Map<string, number>();
  return keys.map((key) => {
    const repeat = repeats.get(key) ?? 0;
    repeats.set(key, repeat + 1);
    return generatedFaceName(bodyKey, repeat === 0 ? key : `${key}#${repeat}`);
  });
}

export function geometryNaming(snapshot: TopologySnapshot): BodyNaming {
  const faces = geometryFaceNames(snapshot.faces);
  return { faces, edges: nameEdges(snapshot, faces) };
}

export function importFileError(fileName: string, size: number): string | null {
  if (!STEP_EXTENSION.test(fileName)) return "Неподдерживаемый формат файла. Нужен STEP (.step или .stp).";
  if (size === 0) return IMPORT_EMPTY_FILE;
  if (size > MAX_IMPORT_FILE_BYTES) {
    return `Файл занимает ${formatMegabytes(size)} — больше предела импорта (${formatMegabytes(MAX_IMPORT_FILE_BYTES)}). Разделите модель на несколько файлов.`;
  }
  return null;
}

export function importBodyCountError(found: number, existingBodies: number): string | null {
  if (found > MAX_IMPORT_BODIES) {
    return `В файле ${pluralize(found, "тело", "тела", "тел")} — за один импорт можно загрузить не больше ${MAX_IMPORT_BODIES}. Разделите модель на несколько файлов.`;
  }
  if (existingBodies + found > MAX_KERNEL_BODIES) {
    return `После импорта в модели станет ${pluralize(existingBodies + found, "тело", "тела", "тел")} — больше предела браузерного ядра (${MAX_KERNEL_BODIES}). Удалите лишние тела или разделите проект.`;
  }
  return null;
}

export function importSizeError(totals: KernelLedgerTotals, stepBytes: number[]): string | null {
  const heavy = stepBytes.findIndex((bytes) => bytes > MAX_BODY_STEP_BYTES);
  if (heavy >= 0) {
    return `Тело ${heavy + 1} из файла слишком сложное для сохранения: его STEP занимает ${formatMegabytes(stepBytes[heavy])} при пределе ${formatMegabytes(MAX_BODY_STEP_BYTES)}.`;
  }
  const modelBytes = stepBytes.reduce((sum, bytes) => sum + bytes, totals.modelBytes);
  if (modelBytes > MAX_KERNEL_MODEL_BYTES) {
    return `После импорта модель займёт ${formatMegabytes(modelBytes)} — больше предела браузерного ядра (${formatMegabytes(MAX_KERNEL_MODEL_BYTES)}). Упростите модель или разделите проект.`;
  }
  return null;
}

export function importSummary(fileName: string, bodyCount: number): string {
  return `Импортировано ${pluralize(bodyCount, "тело", "тела", "тел")} из «${fileName}».`;
}
