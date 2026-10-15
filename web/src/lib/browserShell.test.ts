import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/types/api";
import { boxMesh } from "./control/topologyFixtures";
import { editableValues, featureParamFields, isValidParams } from "./browserFeatureParams";
import { browserRebuildPlan, editableBrowserParams, isBodyStep } from "./browserRebuildPlan";
import {
  shellFaceRows,
  shellFailureMessage,
  shellLabel,
  shellOffset,
  shellParamsError,
  shellVolumeFits,
  toggleShellFace,
  wallMatchesThickness,
} from "./browserShell";

const shellEntry = (params: Record<string, unknown>): TimelineEntry => ({
  id: "sh", kind: "shell", label: "Оболочка 1", status: "ok", timestamp: "", body_id: "b2",
  params: { target_body_id: "b1", face_ids: ["f-top"], thickness: 2, direction: "inward", feature_key: "k-sh", engine: "browser_wasm", ...params },
});

describe("параметры оболочки", () => {
  it("принимает положительную толщину, направление и непустой список граней", () => {
    expect(shellParamsError({ faceNames: ["f-a"], thickness: 2, direction: "inward" })).toBeNull();
    expect(shellParamsError({ faceNames: ["f-a"], thickness: 0, direction: "inward" })).toMatch(/больше нуля/);
    expect(shellParamsError({ faceNames: ["f-a"], thickness: Number.POSITIVE_INFINITY, direction: "outward" })).toMatch(/больше нуля/);
    expect(shellParamsError({ faceNames: ["f-a"], thickness: 1, direction: "both" as never })).toMatch(/внутрь или наружу/);
    expect(shellParamsError({ faceNames: [], thickness: 1, direction: "inward" })).toMatch(/хотя бы одну грань/);
    expect(shellParamsError({ faceNames: ["f-a", "f-a"], thickness: 1, direction: "inward" })).toMatch(/повторяться/);
  });

  it("внутрь смещает стенку против нормали, наружу по ней", () => {
    expect(shellOffset(2, "inward")).toBe(-2);
    expect(shellOffset(2, "outward")).toBe(2);
  });

  it("оболочка внутрь обязана уменьшить объём, наружу просто дать тело", () => {
    expect(shellVolumeFits(8000, 3392, "inward")).toBe(true);
    expect(shellVolumeFits(8000, 8000, "inward")).toBe(false);
    expect(shellVolumeFits(8000, 0, "inward")).toBe(false);
    expect(shellVolumeFits(8000, 4672, "outward")).toBe(true);
    expect(shellVolumeFits(8000, Number.NaN, "outward")).toBe(false);
  });

  it("стенка совпадает с толщиной с допуском на аппроксимацию поверхности", () => {
    expect(wallMatchesThickness(2.005, 2)).toBe(true);
    expect(wallMatchesThickness(4, 6)).toBe(false);
    expect(wallMatchesThickness(Number.NaN, 1)).toBe(false);
  });

  it("объясняет слишком толстую стенку и называет толщину, которая помещается", () => {
    expect(shellFailureMessage(12, "inward", 9.75)).toBe(
      "Толщина стенки 12 мм больше допустимой для этого тела: оболочка внутрь помещается примерно до 9.8 мм. Уменьшите толщину.",
    );
    expect(shellFailureMessage(3, "outward", null)).toMatch(/^Оболочка наружу не строится на этом теле ни при какой толщине/);
  });

  it("подписывает операцию толщиной и направлением", () => {
    expect(shellLabel(1.5, "inward")).toBe("Оболочка 1.5мм внутрь");
    expect(shellLabel(2, "outward")).toBe("Оболочка 2мм наружу");
  });
});

describe("выбор открытых граней оболочки", () => {
  it("клик добавляет грань, повторный клик снимает", () => {
    const one = toggleShellFace({ bodyId: null, faceIds: [] }, "b1", "f-top");
    const two = toggleShellFace(one, "b1", "f-side");
    expect(two).toEqual({ bodyId: "b1", faceIds: ["f-top", "f-side"] });
    expect(toggleShellFace(two, "b1", "f-top")).toEqual({ bodyId: "b1", faceIds: ["f-side"] });
    expect(toggleShellFace(one, "b1", "f-top")).toEqual({ bodyId: null, faceIds: [] });
  });

  it("клик по другому телу начинает выбор заново", () => {
    expect(toggleShellFace({ bodyId: "b1", faceIds: ["f-top"] }, "b2", "f-x")).toEqual({ bodyId: "b2", faceIds: ["f-x"] });
  });

  it("подписывает строки списка видом и площадью грани", () => {
    expect(shellFaceRows(boxMesh(), ["top", "missing"])).toEqual([
      { faceId: "top", label: "Плоская грань · 60 мм²" },
      { faceId: "missing", label: "Грань" },
    ]);
    expect(shellFaceRows(null, ["top"])).toEqual([{ faceId: "top", label: "Грань" }]);
  });
});

describe("оболочка в истории и пересборке", () => {
  it("правится толщина и направление из дерева", () => {
    const entry = shellEntry({});
    expect(editableBrowserParams("shell")).toEqual(["thickness", "direction"]);
    expect(editableValues(entry)).toEqual({ thickness: 2, direction: "inward" });
    expect(featureParamFields(entry, editableValues(entry)).map((field) => field.key)).toEqual(["thickness", "direction"]);
    expect(isValidParams({ thickness: 0, direction: "inward" })).toBe(false);
  });

  it("план пересборки передаёт ядру имена граней, толщину и направление", () => {
    const document = { components: {}, timeline: [shellEntry({})] };
    const [step] = browserRebuildPlan(document, "sh", { thickness: 3, direction: "outward" }).filter(isBodyStep);

    expect(step).toMatchObject({
      kind: "shell",
      outputBodyId: "b2",
      inputBodyIds: ["b1"],
      request: { kind: "shell", featureKey: "k-sh", bodyId: "b1", faceNames: ["f-top"], thickness: 3, direction: "outward" },
    });
  });
});
