import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { nextRegionSelection } from "@/lib/profileRegionSelection";
import { mergeRegions, regionPolygon, sketchRegionLayout, type RegionLayout, type RegionPolygon } from "@/lib/sketchRegions";
import type { SketchFrame } from "@/composables/viewport/types";
import type { SketchEntity } from "@/types/api";
import type { ViewportRef } from "./types";

export interface ProfileSource {
  entities: SketchEntity[];
  frame: SketchFrame;
}

export function useProfileRegions(deps: { viewportRef: ViewportRef; source: Ref<ProfileSource | null> }) {
  const { viewportRef, source } = deps;
  const selected = ref<string[]>([]);

  const layout = computed<RegionLayout | null>(() => {
    if (!source.value) return null;
    try {
      return sketchRegionLayout(source.value.entities);
    } catch {
      return null;
    }
  });

  const regions = computed(() => {
    const current = layout.value;
    if (!current) return [];
    return current.regions.map((region, index) => ({
      key: region.key,
      area: region.area,
      point: region.point,
      holes: region.holes.length,
      polygon: regionPolygon(current, index),
    }));
  });

  const pickable = computed(() => regions.value.length > 1);

  const merged = computed<{ polygons: RegionPolygon[] | null; error: string | null }>(() => {
    if (!layout.value || selected.value.length === 0) return { polygons: null, error: null };
    try {
      return { polygons: mergeRegions(layout.value, selected.value).polygons, error: null };
    } catch (error) {
      return { polygons: [], error: error instanceof Error ? error.message : String(error) };
    }
  });

  function pick(key: string, additive: boolean) {
    selected.value = nextRegionSelection(selected.value, key, additive);
  }

  function select(keys: string[]): string[] {
    const known = new Set(regions.value.map((region) => region.key));
    const missing = keys.filter((key) => !known.has(key));
    if (missing.length === 0) selected.value = [...new Set(keys)];
    return missing;
  }

  function reset() {
    selected.value = [];
  }

  function keys(): string[] | null {
    return selected.value.length > 0 ? [...selected.value] : null;
  }

  function syncViewport() {
    const viewport = viewportRef.value;
    if (!viewport) return;
    if (!source.value || !pickable.value) {
      viewport.hideProfileRegions();
      return;
    }
    viewport.showProfileRegions(
      { frame: source.value.frame, regions: regions.value.map(({ key, polygon }) => ({ key, polygon })), selected: selected.value },
      pick,
    );
  }

  watch([source, regions, selected], syncViewport);
  onScopeDispose(() => viewportRef.value?.hideProfileRegions());

  return { selected, regions, pickable, merged, pick, select, reset, keys };
}

export type ProfileRegionsApi = ReturnType<typeof useProfileRegions>;
