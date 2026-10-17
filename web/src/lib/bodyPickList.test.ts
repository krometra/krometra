import { describe, expect, it } from "vitest";
import {
  defaultCutTargets,
  liveCutTargets,
  pickedForCombine,
  toggledBody,
  withCombineTarget,
  withCombineTool,
} from "./bodyPickList";

const browser = (id: string, visible = true) => ({ id, visible, source: { kind: "browser_extrude" } });

describe("pickedForCombine", () => {
  it("первый клик задаёт цель, следующие добавляют инструменты", () => {
    let pick = pickedForCombine({ targetId: null, toolIds: [] }, "a");
    pick = pickedForCombine(pick, "b");
    pick = pickedForCombine(pick, "c");
    expect(pick).toEqual({ targetId: "a", toolIds: ["b", "c"] });
  });

  it("повторный клик снимает тело из своей роли, освободившаяся цель занимается следующим кликом", () => {
    let pick = pickedForCombine({ targetId: "a", toolIds: ["b", "c"] }, "b");
    expect(pick).toEqual({ targetId: "a", toolIds: ["c"] });
    pick = pickedForCombine(pick, "a");
    expect(pick).toEqual({ targetId: null, toolIds: ["c"] });
    expect(pickedForCombine(pick, "d")).toEqual({ targetId: "d", toolIds: ["c"] });
  });
});

describe("явное назначение роли", () => {
  it("тело-инструмент, ставшее целью, уходит из инструментов", () => {
    expect(withCombineTarget({ targetId: "a", toolIds: ["b", "c"] }, "b")).toEqual({ targetId: "b", toolIds: ["c"] });
  });

  it("цель, добавленная инструментом, освобождает роль цели; повтор не дублирует", () => {
    expect(withCombineTool({ targetId: "a", toolIds: ["b"] }, "a")).toEqual({ targetId: null, toolIds: ["b", "a"] });
    const pick = { targetId: "a", toolIds: ["b"] };
    expect(withCombineTool(pick, "b")).toBe(pick);
  });
});

describe("состав тел для выреза", () => {
  it("по умолчанию берёт все видимые тела браузерного ядра", () => {
    const bodies = [browser("a"), browser("b", false), { id: "legacy", source: { kind: "extrude" } }, browser("c")];
    expect(defaultCutTargets(bodies)).toEqual(["a", "c"]);
  });

  it("toggledBody снимает и возвращает тело в список", () => {
    expect(toggledBody(["a", "b"], "a")).toEqual(["b"]);
    expect(toggledBody(["b"], "a")).toEqual(["b", "a"]);
  });

  it("liveCutTargets отбрасывает тела, которые скрыли или удалили после выбора", () => {
    expect(liveCutTargets(["a", "b", "gone"], [browser("a"), browser("b", false)])).toEqual(["a"]);
  });
});
