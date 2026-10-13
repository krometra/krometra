import { describe, expect, it } from "vitest";
import { assertBrowserVolumeChanged, assertNonEmptyBrowserBoolean, browserBooleanOfExtrude } from "./browserBoolean";

describe("browserBooleanOfExtrude", () => {
  it("maps extrude operations to OCCT booleans", () => {
    expect(browserBooleanOfExtrude("join")).toBe("union");
    expect(browserBooleanOfExtrude("cut")).toBe("subtract");
    expect(browserBooleanOfExtrude("new_body")).toBeNull();
  });
});

describe("assertNonEmptyBrowserBoolean", () => {
  it("rejects a result without volume", () => {
    expect(() => assertNonEmptyBrowserBoolean(0)).toThrow("пуст");
    expect(() => assertNonEmptyBrowserBoolean(Number.NaN)).toThrow("пуст");
    expect(() => assertNonEmptyBrowserBoolean(1)).not.toThrow();
  });
});

describe("assertBrowserVolumeChanged", () => {
  it("rejects a tool that missed the target", () => {
    expect(() => assertBrowserVolumeChanged("cut", 1000, 1000 + 1e-5)).toThrow("Вырез не изменил объём");
    expect(() => assertBrowserVolumeChanged("join", 1000, 1000)).toThrow("Приклеивание не изменил объём");
  });

  it("accepts a real volume change", () => {
    expect(() => assertBrowserVolumeChanged("cut", 1000, 900)).not.toThrow();
    expect(() => assertBrowserVolumeChanged("join", 1000, 1100)).not.toThrow();
  });
});
