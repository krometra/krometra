import { DEFAULT_PRESET, isNavigationPresetId, type NavigationPresetId } from "./navigationPresets";

export interface NavigationSettings {
  preset: NavigationPresetId;
  trackpadScrollZooms: boolean;
}

export function defaultNavigationSettings(): NavigationSettings {
  return { preset: DEFAULT_PRESET, trackpadScrollZooms: false };
}

export function parseNavigationSettings(raw: string | null): NavigationSettings {
  const fallback = defaultNavigationSettings();
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== "object") return fallback;
  const record = parsed as Record<string, unknown>;
  return {
    preset: isNavigationPresetId(record.preset) ? record.preset : fallback.preset,
    trackpadScrollZooms: typeof record.trackpadScrollZooms === "boolean" ? record.trackpadScrollZooms : fallback.trackpadScrollZooms,
  };
}
