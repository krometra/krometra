import { describe, expect, it } from "vitest";
import { defaultNavigationSettings, parseNavigationSettings } from "./navigationSettings";

describe("настройки навигации из localStorage", () => {
  it("по умолчанию - пресет Крометры, трекпад панорамирует", () => {
    expect(defaultNavigationSettings()).toEqual({ preset: "krometra", trackpadScrollZooms: false });
    expect(parseNavigationSettings(null)).toEqual(defaultNavigationSettings());
  });

  it("читает сохранённые значения", () => {
    expect(parseNavigationSettings(JSON.stringify({ preset: "solidworks", trackpadScrollZooms: true }))).toEqual({
      preset: "solidworks",
      trackpadScrollZooms: true,
    });
  });

  it("битые и чужие значения заменяет значениями по умолчанию поштучно", () => {
    expect(parseNavigationSettings("{не json")).toEqual(defaultNavigationSettings());
    expect(parseNavigationSettings("42")).toEqual(defaultNavigationSettings());
    expect(parseNavigationSettings(JSON.stringify({ preset: "catia", trackpadScrollZooms: true }))).toEqual({
      preset: "krometra",
      trackpadScrollZooms: true,
    });
    expect(parseNavigationSettings(JSON.stringify({ preset: "onshape", trackpadScrollZooms: "да" }))).toEqual({
      preset: "onshape",
      trackpadScrollZooms: false,
    });
  });
});
