import { describe, expect, it } from "vitest";
import type { SketchEntity } from "@/types/api";
import { defaultSweepSketches, sweepSetupError, type SweepSketchCandidate } from "./browserSweepSetup";

const circle: SketchEntity = { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 2 };
const riser: SketchEntity = { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } };

function candidate(id: string, entities: SketchEntity[], plane: "XY" | "XZ", used = false): SweepSketchCandidate {
  return { id, used, placement: { entities, plane, planeOffset: 0, planeBasis: null } };
}

const profile = candidate("profile", [circle], "XY");
const path = candidate("path", [riser], "XZ");

describe("выбор эскизов протяжки по умолчанию", () => {
  it("берёт свежий замкнутый эскиз профилем, а незамкнутый — путём", () => {
    expect(defaultSweepSketches([profile, path], null)).toEqual({ profileSketchId: "profile", pathSketchId: "path" });
    expect(defaultSweepSketches([path, profile], null)).toEqual({ profileSketchId: "profile", pathSketchId: "path" });
  });

  it("предпочитает выбранный в дереве эскиз профилем и неиспользованные эскизы", () => {
    const older = candidate("older", [circle], "XY");
    const usedPath = candidate("used-path", [riser], "XZ", true);
    expect(defaultSweepSketches([older, profile, path, usedPath], "older")).toEqual({ profileSketchId: "older", pathSketchId: "path" });
  });

  it("оставляет выбор пустым, если подходящих эскизов нет", () => {
    expect(defaultSweepSketches([path], null)).toEqual({ profileSketchId: null, pathSketchId: "path" });
    expect(defaultSweepSketches([profile], null)).toEqual({ profileSketchId: "profile", pathSketchId: null });
  });
});

describe("проверка настроек протяжки", () => {
  const setup = { profile, path, operation: "new_body" as const, targetBodyId: null };

  it("пропускает путь, начатый на профиле", () => {
    expect(sweepSetupError(setup)).toBeNull();
  });

  it("просит выбрать недостающие эскизы и цель", () => {
    expect(sweepSetupError({ ...setup, profile: null })).toContain("эскиз профиля");
    expect(sweepSetupError({ ...setup, path: null })).toContain("эскиз пути");
    expect(sweepSetupError({ ...setup, path: profile })).toContain("в разных эскизах");
    expect(sweepSetupError({ ...setup, operation: "cut" })).toContain("целевое тело");
  });

  it("передаёт объяснение, почему путь не подходит", () => {
    const far = candidate("far", [{ ...riser, start: { x: 0, y: 4 } }], "XZ");
    expect(sweepSetupError({ ...setup, path: far })).toContain("не начинается в плоскости профиля");
  });
});
