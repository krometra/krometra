import { describe, expect, it } from "vitest";
import type { BrowserExtrudeOptions } from "@/composables/editor/useBrowserGeometry";
import { browserExtrudeForm, browserExtrudeLabel } from "./browserExtrudeForm";

const options = (patch: Partial<BrowserExtrudeOptions>): BrowserExtrudeOptions => ({
  distance: 10,
  direction: "one_side",
  extentType: "distance",
  backDistance: 0,
  offset: 0,
  operation: "new_body",
  targetBodyId: null,
  upToBodyId: null,
  upToFaceId: null,
  upToFacePoints: null,
  ...patch,
});

describe("browserExtrudeForm", () => {
  it("отправляет только базовые поля для выдавливания на расстояние", () => {
    expect(browserExtrudeForm(options({}))).toEqual({
      distance: "10", direction: "one_side", operation: "new_body", extent_type: "distance",
    });
  });

  it("передаёт обратное расстояние, цель и смещение до грани", () => {
    expect(browserExtrudeForm(options({
      direction: "two_sided", backDistance: 3, extentType: "up_to_face", offset: 1.5,
      operation: "cut", targetBodyId: "body-a", upToBodyId: "body-b", upToFaceId: 7,
      upToFacePoints: [[0, 0, 1]],
    }))).toEqual({
      distance: "10", direction: "two_sided", operation: "cut", extent_type: "up_to_face",
      back_distance: "3", offset: "1.5", target_body_id: "body-a", up_to_body_id: "body-b", up_to_face_id: "7",
    });
  });
});

describe("profile_regions", () => {
  it("отправляет выбранные регионы JSON-списком и молчит без выбора", () => {
    expect(browserExtrudeForm(options({ profileRegions: ["ra", "rb"] })).profile_regions).toBe('["ra","rb"]');
    expect(browserExtrudeForm(options({ profileRegions: [] }))).not.toHaveProperty("profile_regions");
    expect(browserExtrudeForm(options({ profileRegions: null }))).not.toHaveProperty("profile_regions");
  });
});

describe("browserExtrudeLabel", () => {
  it("называет операцию по типу границы", () => {
    expect(browserExtrudeLabel(options({ distance: -4 }))).toBe("Выдавить 4мм в браузере");
    expect(browserExtrudeLabel(options({ extentType: "through_all" }))).toBe("Выдавить насквозь в браузере");
    expect(browserExtrudeLabel(options({ extentType: "up_to_body" }))).toBe("Выдавить до тела в браузере");
  });
});
