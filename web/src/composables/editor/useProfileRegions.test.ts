import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { SketchEntity } from "@/types/api";
import type { ViewportRef } from "./types";
import { useProfileRegions, type ProfileSource } from "./useProfileRegions";

const circleAndStrip: SketchEntity[] = [
  { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 10 },
  { id: "r", type: "rectangle", corner1: { x: 0, y: -5 }, corner2: { x: 20, y: 5 } },
];

function setup(entities: SketchEntity[] | null = circleAndStrip) {
  const viewport = { showProfileRegions: vi.fn(), hideProfileRegions: vi.fn() };
  const source = ref<ProfileSource | null>(entities ? { entities, frame: { plane: "XY" } } : null);
  const scope = effectScope();
  const profile = scope.run(() => useProfileRegions({ viewportRef: ref(viewport) as unknown as ViewportRef, source }))!;
  return { profile, viewport, source };
}

describe("useProfileRegions", () => {
  it("lists regions and keeps the whole sketch until a region is picked", () => {
    const { profile } = setup();

    expect(profile.regions.value).toHaveLength(3);
    expect(profile.pickable.value).toBe(true);
    expect(profile.keys()).toBeNull();
    expect(profile.merged.value.polygons).toBeNull();
  });

  it("picks, adds with Shift and resets the selection", () => {
    const { profile } = setup();
    const [a, b] = profile.regions.value.map((region) => region.key);

    profile.pick(a, false);
    profile.pick(b, true);
    expect(profile.keys()).toEqual([a, b]);
    expect(profile.merged.value.polygons).toHaveLength(1);

    profile.reset();
    expect(profile.keys()).toBeNull();
  });

  it("refuses unknown keys without touching the selection", () => {
    const { profile } = setup();

    expect(profile.select(["rnope"])).toEqual(["rnope"]);
    expect(profile.keys()).toBeNull();
  });

  it("shows pickable regions in the viewport and hides them when the panel closes", async () => {
    const { profile, viewport, source } = setup();
    const key = profile.regions.value[0].key;

    profile.pick(key, false);
    await nextTick();
    expect(viewport.showProfileRegions).toHaveBeenLastCalledWith(
      expect.objectContaining({ selected: [key], regions: expect.arrayContaining([expect.objectContaining({ key })]) }),
      profile.pick,
    );

    source.value = null;
    await nextTick();
    expect(viewport.hideProfileRegions).toHaveBeenCalled();
  });

  it("reports a selection that vanished after a sketch edit", async () => {
    const { profile, source } = setup();
    profile.pick(profile.regions.value[0].key, false);

    source.value = { entities: [circleAndStrip[1]], frame: { plane: "XY" } };
    await nextTick();

    expect(profile.merged.value.error).toContain("Выберите профиль заново");
  });
});
