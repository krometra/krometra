import { loftTransitionOf } from "./browserLoftSetup";

export const LOFT_ICON = "M4 20h16 M7 4h10 M4 20L7 4 M20 20L17 4 M6 12h12";

const OPERATION_LABELS: Record<string, string> = { new_body: "Новое тело", join: "Приклеить", cut: "Вырезать" };

function profileIds(params: Record<string, unknown>): string[] {
  return Array.isArray(params.profile_sketch_ids) ? params.profile_sketch_ids.filter((id): id is string => typeof id === "string") : [];
}

export function loftTransitionLabel(params: Record<string, unknown>): string {
  return loftTransitionOf(params.transition) === "ruled" ? "Линейный" : "Гладкий";
}

export function loftSummary(params: Record<string, unknown>): string {
  return `${profileIds(params).length} проф. · ${loftTransitionLabel(params).toLowerCase()}`;
}

export function loftParamRows(params: Record<string, unknown>, sketchLabel: (sketchId: string) => string): { label: string; value: string }[] {
  return [
    { label: "Профили", value: profileIds(params).map(sketchLabel).join(" → ") || "-" },
    { label: "Переход", value: loftTransitionLabel(params) },
    { label: "Операция", value: OPERATION_LABELS[String(params.operation ?? "new_body")] ?? "-" },
  ];
}
