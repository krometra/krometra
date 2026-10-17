import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import {
  draftDetail,
  draftFailureMessage,
  draftFeatureOfParams,
  draftFormFields,
  draftLabel,
  draftParamsError,
  draftPullDirection,
  toggleDraftFaces,
  type BrowserDraftFeature,
} from "./browserDraft";
import { editableValues, featureParamFields, isValidParams } from "./browserFeatureParams";
import { browserRebuildPlan, isBodyStep } from "./browserRebuildPlan";

const feature: BrowserDraftFeature = {
  bodyId: "body-1",
  faceNames: ["f-a", "f-b"],
  neutral: { kind: "face", faceId: "f-bottom" },
  angleDeg: 3,
  reverse: false,
};

describe("параметры уклона", () => {
  it("угол строго между 0 и 90°, грани уникальны, нейтральная грань не под уклоном", () => {
    expect(draftParamsError(feature)).toBeNull();
    expect(draftParamsError({ ...feature, angleDeg: 0 })).toMatch(/больше 0°/);
    expect(draftParamsError({ ...feature, angleDeg: 90 })).toMatch(/меньше 90°/);
    expect(draftParamsError({ ...feature, angleDeg: Number.NaN })).toMatch(/больше 0°/);
    expect(draftParamsError({ ...feature, faceNames: [] })).toMatch(/хотя бы одну/);
    expect(draftParamsError({ ...feature, faceNames: ["f-a", "f-a"] })).toMatch(/повторяться/);
    expect(draftParamsError({ ...feature, faceNames: ["f-bottom"] })).toMatch(/Нейтральная грань/);
  });

  it("направление вытягивания: нормаль базовой плоскости, внутрь от грани, реверс переворачивает", () => {
    expect(draftPullDirection({ kind: "base", plane: "XY" }, [0, 0, 1], false)).toEqual([0, 0, 1]);
    expect(draftPullDirection({ kind: "base", plane: "XY" }, [0, 0, 1], true)).toEqual([-0, -0, -1]);
    expect(draftPullDirection({ kind: "face", faceId: "f" }, [0, 0, -1], false)).toEqual([-0, -0, 1]);
    expect(draftPullDirection({ kind: "face", faceId: "f" }, [0, 0, -1], true)).toEqual([0, 0, -1]);
  });

  it("сообщение об отказе называет помещающийся угол", () => {
    expect(draftFailureMessage(60, 26.25)).toMatch(/Уклон 60° не строится.*до 26\.3°/);
    expect(draftFailureMessage(5, null)).toMatch(/ни при каком угле/);
  });

  it("подписи и детали истории", () => {
    expect(draftLabel(3, { kind: "base", plane: "XZ" })).toBe("Уклон 3° от XZ");
    expect(draftLabel(2.5, feature.neutral)).toBe("Уклон 2.5° от грани");
    expect(draftDetail({ angle_deg: 4, neutral_plane: "YZ", face_ids: ["f-a"] })).toBe("4° · от YZ · граней: 1");
  });
});

describe("форма и параметры истории", () => {
  it("форма сохранения передаёт нейтраль либо плоскостью, либо гранью", () => {
    expect(draftFormFields(feature, 7)).toEqual({
      body_id: "body-1", face_ids: '["f-a","f-b"]', neutral_face_id: "f-bottom", angle_deg: "3", reverse: "false", document_version: "7",
    });
    expect(draftFormFields({ ...feature, neutral: { kind: "base", plane: "YZ" }, reverse: true }, 1)).toMatchObject({ neutral_plane: "YZ", reverse: "true" });
  });

  it("признак из параметров записи истории", () => {
    expect(draftFeatureOfParams({ target_body_id: "b", face_ids: ["f-a"], neutral_plane: "XZ", angle_deg: 7, reverse: true })).toEqual({
      bodyId: "b", faceNames: ["f-a"], neutral: { kind: "base", plane: "XZ" }, angleDeg: 7, reverse: true,
    });
    expect(draftFeatureOfParams({ neutral_face_id: "f-n", neutral_plane: null })).toMatchObject({ neutral: { kind: "face", faceId: "f-n" }, angleDeg: 3 });
  });

  it("в свойствах операции правится угол, пересборка получает новый угол", () => {
    const entry = {
      id: "tl-d", kind: "draft", label: "Уклон 1", timestamp: "", status: "ok", body_id: "body-2",
      params: { engine: "browser_wasm", target_body_id: "body-1", face_ids: ["f-a"], neutral_plane: "XY", angle_deg: 3, reverse: false, feature_key: "k-1" },
    } as TimelineEntry;
    expect(featureParamFields(entry, editableValues(entry)).map((field) => field.key)).toEqual(["angle_deg"]);
    expect(editableValues(entry)).toEqual({ angle_deg: 3 });
    expect(isValidParams({ angle_deg: 89 })).toBe(true);
    expect(isValidParams({ angle_deg: 90 })).toBe(false);
    const [step] = browserRebuildPlan({ components: { "body-1": { type: "body" } }, timeline: [entry] }, "tl-d", { angle_deg: 6 });
    expect(isBodyStep(step) && step.request).toEqual({
      kind: "draft", featureKey: "k-1", bodyId: "body-1", faceNames: ["f-a"], neutral: { kind: "base", plane: "XY" }, angleDeg: 6, reverse: false,
    });
  });
});

describe("toggleDraftFaces", () => {
  it("группа добавляется целиком и снимается, только если выбрана вся", () => {
    const empty = { bodyId: null, faceIds: [] };
    const chain = toggleDraftFaces(empty, "b", ["f-1", "f-2"]);
    expect(chain).toEqual({ bodyId: "b", faceIds: ["f-1", "f-2"] });
    expect(toggleDraftFaces(chain, "b", ["f-2", "f-3"])).toEqual({ bodyId: "b", faceIds: ["f-1", "f-2", "f-3"] });
    expect(toggleDraftFaces(chain, "b", ["f-2", "f-1"])).toEqual({ bodyId: null, faceIds: [] });
  });

  it("клик по другому телу начинает выбор заново", () => {
    expect(toggleDraftFaces({ bodyId: "b", faceIds: ["f-1"] }, "c", ["f-9", "f-9"])).toEqual({ bodyId: "c", faceIds: ["f-9"] });
  });
});
