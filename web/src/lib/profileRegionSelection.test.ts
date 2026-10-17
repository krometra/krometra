import { describe, expect, it } from "vitest";
import { nextRegionSelection, profileRegionsLabel } from "./profileRegionSelection";

describe("nextRegionSelection", () => {
  it("replaces the selection on a plain click and clears it on a repeated one", () => {
    expect(nextRegionSelection([], "a", false)).toEqual(["a"]);
    expect(nextRegionSelection(["a", "b"], "c", false)).toEqual(["c"]);
    expect(nextRegionSelection(["a"], "a", false)).toEqual([]);
  });

  it("adds and removes a region with Shift", () => {
    expect(nextRegionSelection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(nextRegionSelection(["a", "b"], "a", true)).toEqual(["b"]);
  });
});

describe("profileRegionsLabel", () => {
  it("says the whole sketch is used until regions are picked", () => {
    expect(profileRegionsLabel(0, 1)).toBe("Весь эскиз");
    expect(profileRegionsLabel(0, 3)).toBe("Весь эскиз · регионов 3");
    expect(profileRegionsLabel(2, 3)).toBe("Выбрано регионов: 2 из 3");
  });
});
