import { isBrowserBody } from "./browserShapeHydration";
import type { ComponentEntry } from "./useDocumentModel";

export type ExportFormat = "stl" | "step";

export const EXPORT_MIME: Record<ExportFormat, string> = {
  step: "application/step",
  stl: "model/stl",
};

const SERVER_KERNEL_BODIES = "Проект содержит тела серверного ядра — их экспорт больше не поддерживается.";
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]+/g;

export function exportBodyIdsOf(bodies: ComponentEntry[]): string[] {
  const visible = bodies.filter((body) => body.visible !== false);
  if (visible.length === 0) throw new Error("Нечего экспортировать: нет видимых тел.");
  if (!visible.every(isBrowserBody)) throw new Error(SERVER_KERNEL_BODIES);
  return visible.map((body) => body.id);
}

export function requestedExportBodyIds(bodies: ComponentEntry[], requested: string[]): string[] {
  const ids = [...new Set(requested)];
  if (ids.length === 0) throw new Error("Нечего экспортировать: список тел пуст.");
  const chosen = ids.map((id) => bodies.find((body) => body.id === id));
  const missing = ids.filter((_, index) => !chosen[index]);
  if (missing.length > 0) throw new Error(`В документе нет тел: ${missing.join(", ")}.`);
  if (!chosen.every((body) => body && isBrowserBody(body))) throw new Error(SERVER_KERNEL_BODIES);
  return ids;
}

export function exportFilename(projectName: string, format: ExportFormat, bodyLabels: string[] | null): string {
  const base = bodyLabels ? `${projectName}-${bodyLabels.join("+")}` : projectName;
  return `${base.replace(UNSAFE_FILENAME_CHARS, "_")}.${format}`;
}
