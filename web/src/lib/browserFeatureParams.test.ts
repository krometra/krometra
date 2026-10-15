import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { changedParams, editableValues, featureParamFields, isValidParams } from "./browserFeatureParams";

const entry = (kind: TimelineEntry["kind"], params: Record<string, unknown>): TimelineEntry => ({
  id: "e", kind, label: "e", status: "ok", timestamp: "", params: { ...params, engine: "browser_wasm" },
});

describe("параметры browser-операций", () => {
  it("берёт редактируемые значения из истории с безопасными умолчаниями", () => {
    expect(editableValues(entry("fillet", { radius: 3, edge_ids: ["e-a"] }))).toEqual({ radius: 3 });
    expect(editableValues(entry("extrude", { distance: 5 }))).toEqual({ distance: 5, direction: "one_side", back_distance: 0, offset: 0 });
  });

  it("показывает поля по границе и направлению выдавливания", () => {
    const keys = (params: Record<string, unknown>, values: Record<string, string | number>) =>
      featureParamFields(entry("extrude", params), values).map((field) => field.key);

    expect(keys({ extent_type: "distance" }, { direction: "one_side" })).toEqual(["distance", "direction"]);
    expect(keys({ extent_type: "distance" }, { direction: "two_sided" })).toEqual(["distance", "direction", "back_distance"]);
    expect(keys({ extent_type: "up_to_face" }, { direction: "one_side" })).toEqual(["direction", "offset"]);
    expect(featureParamFields({ ...entry("fillet", {}), params: { radius: 1 } }, {})).toEqual([]);
  });

  it("отдаёт только изменённые параметры для команды и отката", () => {
    expect(changedParams({ radius: 1, x: 2 }, { radius: 1, x: 2 })).toBeNull();
    expect(changedParams({ distance: 10, direction: "one_side" }, { distance: 12, direction: "one_side" }))
      .toEqual({ previous: { distance: 10 }, next: { distance: 12 } });
  });

  it("не пускает в пересборку заведомо неверные значения", () => {
    expect(isValidParams({ radius: 0 })).toBe(false);
    expect(isValidParams({ distance: -5, offset: -1 })).toBe(true);
    expect(isValidParams({ angle: 361 })).toBe(false);
  });

  it("массив правит количество, шаг и угол, а у отдельных тел — без количества", () => {
    const keys = (params: Record<string, unknown>) => featureParamFields(entry("pattern", params), {}).map((field) => field.key);
    expect(keys({ pattern_type: "linear", mode: "join" })).toEqual(["count", "spacing"]);
    expect(keys({ pattern_type: "linear", mode: "join", axis2: { kind: "y" } })).toEqual(["count", "spacing", "count2", "spacing2"]);
    expect(keys({ pattern_type: "circular", mode: "join" })).toEqual(["count", "angle"]);
    expect(keys({ pattern_type: "circular", mode: "separate" })).toEqual(["angle"]);
    expect(editableValues(entry("pattern", { count: 4, spacing: 7 }))).toEqual({ count: 4, spacing: 7, angle: 360, count2: 1, spacing2: 10 });
    expect(isValidParams({ count: 2.5 })).toBe(false);
    expect(isValidParams({ count: 1 })).toBe(false);
    expect(isValidParams({ count2: 1, spacing: -3 })).toBe(true);
    expect(isValidParams({ spacing2: 0 })).toBe(false);
  });
});
