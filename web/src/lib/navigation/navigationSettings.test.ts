import { describe, expect, it } from "vitest";
import { defaultNavigationSettings, parseNavigationSettings } from "./navigationSettings";

describe("настройки навигации из localStorage", () => {
  it("по умолчанию - пресет Крометры, трекпад панорамирует", () => {
    expect(defaultNavigationSettings()).toEqual({ preset: "krometra", trackpadPan: false });
    expect(parseNavigationSettings(null)).toEqual(defaultNavigationSettings());
  });

  it("читает сохранённые значения", () => {
    expect(parseNavigationSettings(JSON.stringify({ preset: "solidworks", trackpadPan: true }))).toEqual({
      preset: "solidworks",
      trackpadPan: true,
    });
  });

  it("битые и чужие значения заменяет значениями по умолчанию поштучно", () => {
    expect(parseNavigationSettings("{не json")).toEqual(defaultNavigationSettings());
    expect(parseNavigationSettings("42")).toEqual(defaultNavigationSettings());
    expect(parseNavigationSettings(JSON.stringify({ preset: "catia", trackpadPan: true }))).toEqual({
      preset: "krometra",
      trackpadPan: true,
    });
    expect(parseNavigationSettings(JSON.stringify({ preset: "onshape", trackpadPan: "да" }))).toEqual({
      preset: "onshape",
      trackpadPan: false,
    });
  });

  it("старая настройка «скролл = зум» не переносится: по умолчанию колесо зумит", () => {
    expect(parseNavigationSettings(JSON.stringify({ preset: "fusion", trackpadScrollZooms: false }))).toEqual({ preset: "fusion", trackpadPan: false });
  });
});
