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

  it("у зеркала правится базовая плоскость и смещение, а зеркало по грани не правится", () => {
    const base = entry("mirror", { plane: "XZ", offset: 2, face_id: null, merge: true });
    expect(editableValues(base)).toEqual({ plane: "XZ", offset: 2 });
    expect(featureParamFields(base, editableValues(base)).map((field) => [field.key, field.kind])).toEqual([["plane", "select"], ["offset", "number"]]);
    expect(featureParamFields(base, {})[0].options?.map((option) => option.value)).toEqual(["XY", "XZ", "YZ"]);
    expect(featureParamFields(entry("mirror", { plane: null, face_id: "f-x" }), {})).toEqual([]);
    expect(editableValues(entry("mirror", { face_id: "f-x" }))).toEqual({ plane: "XY", offset: 0 });
  });

  it("даёт протяжке выбор ориентации профиля", () => {
    expect(editableValues(entry("sweep", { path_sketch_id: "s2" }))).toEqual({ orientation: "corrected" });
    expect(featureParamFields(entry("sweep", {}), { orientation: "corrected" }).map((field) => field.options?.map((option) => option.value)))
      .toEqual([["corrected", "frenet"]]);
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
});
