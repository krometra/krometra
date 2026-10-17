import { readonly, ref } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { NavigationPresetId } from "@/lib/navigation/navigationPresets";
import { parseNavigationSettings, type NavigationSettings } from "@/lib/navigation/navigationSettings";

export const NAVIGATION_STORAGE_KEY = "krometra.navigation";

function readStoredSettings(): NavigationSettings {
  try {
    return parseNavigationSettings(localStorage.getItem(NAVIGATION_STORAGE_KEY));
  } catch {
    return parseNavigationSettings(null);
  }
}

function storeSettings(settings: NavigationSettings): void {
  try {
    localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}

export const useNavigationSettings = createSharedComposable(() => {
  const settings = ref<NavigationSettings>(readStoredSettings());

  function update(patch: Partial<NavigationSettings>): NavigationSettings {
    settings.value = { ...settings.value, ...patch };
    storeSettings(settings.value);
    return settings.value;
  }

  return {
    settings: readonly(settings),
    current: (): NavigationSettings => settings.value,
    setPreset: (preset: NavigationPresetId) => update({ preset }),
    setTrackpadScrollZooms: (trackpadScrollZooms: boolean) => update({ trackpadScrollZooms }),
  };
});
