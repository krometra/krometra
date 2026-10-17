import { describe, expect, it } from "vitest";
import type { SketchEntity } from "@/types/api";
import { ControlError } from "./protocol";
import { constructionEdit } from "./sketchConstruction";

const entities: SketchEntity[] = [
  { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
  { id: "b", type: "circle", center: { x: 0, y: 0 }, radius: 4, construction: true },
  { id: "inf", type: "infline", point: { x: 0, y: 0 }, angle: 0 },
];

function code(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof ControlError ? error.code : "other";
  }
}

describe("constructionEdit", () => {
  it("явный флаг ставится всем указанным", () => {
    const edit = constructionEdit(entities, ["a", "b"], false);
    expect(edit.construction).toBe(false);
    expect(edit.entities.filter((e) => e.type !== "infline").every((e) => !("construction" in e))).toBe(true);
  });

  it("без флага переключает по правилу клавиши X", () => {
    expect(constructionEdit(entities, ["a", "b"], undefined).construction).toBe(true);
    expect(constructionEdit(entities, ["b"], undefined).construction).toBe(false);
  });

  it("неизвестный id и бесконечная прямая - invalid_params", () => {
    expect(code(() => constructionEdit(entities, ["nope"], true))).toBe("invalid_params");
    expect(code(() => constructionEdit(entities, ["inf"], false))).toBe("invalid_params");
  });
});
