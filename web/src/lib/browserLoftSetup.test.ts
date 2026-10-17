import { describe, expect, it } from "vitest";
import type { SketchEntity } from "@/types/api";
import {
  defaultLoftSketches,
  loftProfileOf,
  loftSetupError,
  loftTransitionOf,
  movedLoftProfile,
  sameLoftPlane,
  withLoftProfile,
  withoutLoftProfile,
  type LoftSketchCandidate,
} from "./browserLoftSetup";

const square: SketchEntity = { id: "sq", type: "rectangle", corner1: { x: -10, y: -10 }, corner2: { x: 10, y: 10 } };
const round: SketchEntity = { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 5 };
const open: SketchEntity = { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 10 } };
const ring = [round, { id: "c2", type: "circle", center: { x: 0, y: 0 }, radius: 2 }] as SketchEntity[];

function candidate(id: string, entities: SketchEntity[], planeOffset: number, used = false, plane: "XY" | "XZ" = "XY"): LoftSketchCandidate {
  return { id, label: `Эскиз ${id}`, used, placement: { entities, plane, planeOffset, planeBasis: null } };
}

describe("профиль лофта", () => {
  it("принимает один замкнутый контур", () => {
    expect(loftProfileOf([square], "А")).toEqual(square);
    expect(loftProfileOf([round], "А")).toEqual(round);
  });

  it("отклоняет несколько областей, отверстия и незамкнутый контур с понятной причиной", () => {
    const twoSquares = [square, { id: "sq2", type: "rectangle", corner1: { x: 20, y: 0 }, corner2: { x: 30, y: 10 } }] as SketchEntity[];
    expect(() => loftProfileOf(twoSquares, "А")).toThrow("В эскизе «А» 2 замкнутых области");
    expect(() => loftProfileOf(ring, "А")).toThrow("с отверстием");
    expect(() => loftProfileOf([open], "А")).toThrow("Эскиз «А» не подходит для лофта");
  });
});

describe("плоскости профилей", () => {
  it("различает параллельные плоскости по смещению и разные ориентации", () => {
    expect(sameLoftPlane(candidate("a", [square], 0).placement, candidate("b", [round], 0).placement)).toBe(true);
    expect(sameLoftPlane(candidate("a", [square], 0).placement, candidate("b", [round], 30).placement)).toBe(false);
    expect(sameLoftPlane(candidate("a", [square], 0).placement, candidate("b", [round], 0, false, "XZ").placement)).toBe(false);
  });
});

describe("проверка настроек лофта", () => {
  const bottom = candidate("bottom", [square], 0);
  const top = candidate("top", [round], 30);

  it("пропускает два профиля на разных плоскостях", () => {
    expect(loftSetupError({ profiles: [bottom, top], operation: "new_body", targetBodyId: null })).toBeNull();
  });

  it("просит минимум два профиля, разные эскизы и плоскости, цель для выреза", () => {
    expect(loftSetupError({ profiles: [bottom], operation: "new_body", targetBodyId: null })).toContain("минимум по двум");
    expect(loftSetupError({ profiles: [bottom, bottom], operation: "new_body", targetBodyId: null })).toContain("дважды");
    expect(loftSetupError({ profiles: [bottom, candidate("flat", [round], 0)], operation: "new_body", targetBodyId: null })).toContain("в одной плоскости");
    expect(loftSetupError({ profiles: [bottom, top], operation: "cut", targetBodyId: null })).toContain("целевое тело");
    expect(loftSetupError({ profiles: [bottom, candidate("path", [open], 30)], operation: "new_body", targetBodyId: null })).toContain("не подходит");
  });
});

describe("выбор профилей по умолчанию", () => {
  it("берет свободные эскизы с одним контуром на разных плоскостях в порядке документа", () => {
    const candidates = [candidate("a", [square], 0), candidate("path", [open], 10, false, "XZ"), candidate("b", [round], 30), candidate("same", [round], 30)];
    expect(defaultLoftSketches(candidates, null)).toEqual(["a", "b"]);
  });

  it("включает выбранный в дереве эскиз и добирает использованные до двух", () => {
    const candidates = [candidate("used", [square], 0, true), candidate("picked", [round], 30, true)];
    expect(defaultLoftSketches(candidates, "picked")).toEqual(["used", "picked"]);
    expect(defaultLoftSketches([candidate("used", [square], 0, true), candidate("free", [round], 30), candidate("used2", [round], 60, true)], null)).toEqual(["used", "free"]);
  });
});

describe("правка списка профилей", () => {
  it("добавляет без повторов, удаляет и переставляет", () => {
    expect(withLoftProfile(["a"], "b")).toEqual(["a", "b"]);
    expect(withLoftProfile(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(withoutLoftProfile(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    expect(movedLoftProfile(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(movedLoftProfile(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  });

  it("читает переход из параметров записи", () => {
    expect(loftTransitionOf("ruled")).toBe("ruled");
    expect(loftTransitionOf(undefined)).toBe("smooth");
  });
});
