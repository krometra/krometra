import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { SketchEntity, SketchLine } from "@/types/api";
import { snapAt } from "@/sketcher/snapCandidates";
import { useAutoConstraints } from "./useAutoConstraints";
import { useConstructionMode } from "./useConstructionMode";

const side: SketchLine = { id: "side", type: "line", start: { x: 0, y: 0 }, end: { x: 40, y: 0 } };

function setup(entities: SketchEntity[] = [side]) {
  let counter = 0;
  const auto = useAutoConstraints({ entities: ref(entities), pixelsToWorld: (px) => px / 10 });
  return { auto, makeId: () => `c${++counter}`, entities };
}

const drawn = (start: { x: number; y: number }, end: { x: number; y: number }): SketchLine => ({ id: "new", type: "line", start, end });

describe("useAutoConstraints", () => {
  it("от конца стороны вверх: до клика значки ⊥ нет, V есть; после клика - те же ограничения плюс совпадение начала", () => {
    const { auto, makeId, entities } = setup();
    const start = snapAt(entities, { x: 40.05, y: 0 }, 0.5)!;
    auto.begin(start.point, start);
    const end = auto.refineEnd("line", { x: 41, y: 25 }, null);

    expect(end).toEqual({ x: 40, y: 25 });
    expect(auto.hint.value).toEqual({ at: end, symbols: ["V"] });

    const constraints = auto.constraintsFor("line", [drawn(start.point, end)], makeId);
    expect(constraints.map((c) => [c.type, c.anchors])).toEqual([
      ["coincident", [{ entity_id: "new", sub_index: 0 }, { entity_id: "side", sub_index: 1 }]],
      ["vertical", [{ entity_id: "new", sub_index: 0 }]],
    ]);
    expect(auto.hint.value).toBeNull();
  });

  it("Shift отключает прилипание, значок и ограничения конца", () => {
    const { auto, makeId } = setup();
    auto.begin({ x: 10, y: 10 }, null);
    auto.setSuppressed(true);
    const end = auto.refineEnd("line", { x: 30, y: 10.5 }, null);
    expect(end).toEqual({ x: 30, y: 10.5 });
    expect(auto.hint.value).toBeNull();
    expect(auto.constraintsFor("line", [drawn({ x: 10, y: 10 }, end)], makeId)).toEqual([]);
  });

  it("Shift на первом клике не даёт совпадения начала, но конец планируется", () => {
    const { auto, makeId, entities } = setup();
    const start = snapAt(entities, { x: 0, y: 0.05 }, 0.5)!;
    auto.setSuppressed(true);
    auto.begin(start.point, start);
    auto.setSuppressed(false);
    const end = auto.refineEnd("line", { x: -20, y: 0.3 }, null);
    expect(auto.constraintsFor("line", [drawn(start.point, end)], makeId).map((c) => c.type)).toEqual(["horizontal"]);
  });

  it("прямоугольник: второй угол на конце стороны - совпадение с началом третьей стороны", () => {
    const { auto, makeId, entities } = setup();
    auto.begin({ x: 10, y: 30 }, null);
    const corner = snapAt(entities, { x: 40, y: 0.05 }, 0.5)!;
    auto.refineEnd("rectangle", corner.point, corner);
    expect(auto.hint.value?.symbols).toEqual(["●"]);
    const rectangle = (corner: { x: number; y: number }) =>
      [0, 1, 2, 3].map((i) => ({ ...drawn(i === 2 ? corner : { x: 10, y: 30 }, { x: 0, y: 0 }), id: `r-e${i}` }));
    expect(auto.constraintsFor("rectangle", rectangle(corner.point), makeId).map((c) => c.anchors)).toEqual([
      [{ entity_id: "r-e2", sub_index: 0 }, { entity_id: "side", sub_index: 1 }],
    ]);
  });

  it("размер, введённый в поле, увёл угол от привязки - совпадения угла нет", () => {
    const { auto, makeId, entities } = setup();
    auto.begin({ x: 10, y: 30 }, null);
    const corner = snapAt(entities, { x: 40, y: 0.05 }, 0.5)!;
    auto.refineEnd("rectangle", corner.point, corner);
    const typed = [0, 1, 2, 3].map((i) => ({ ...drawn(i === 2 ? { x: 35, y: 0 } : { x: 10, y: 30 }, { x: 0, y: 0 }), id: `r-e${i}` }));
    expect(auto.constraintsFor("rectangle", typed, makeId)).toEqual([]);
  });

  it("reset снимает значок, например по Esc", () => {
    const { auto } = setup();
    auto.begin({ x: 0, y: 10 }, null);
    auto.refineEnd("line", { x: 20, y: 10.2 }, null);
    expect(auto.hint.value).not.toBeNull();
    auto.reset();
    expect(auto.hint.value).toBeNull();
  });
});

describe("useConstructionMode", () => {
  function mode(selected: string[], entities: SketchEntity[] = [side]) {
    const calls: string[] = [];
    const api = useConstructionMode({
      entities: ref(entities),
      selectedEntityIds: ref(selected),
      toggleSelected: () => calls.push("selected"),
      onModeChange: () => calls.push("mode"),
    });
    return { api, calls };
  }

  it("в режиме новые объекты помечаются вспомогательными, без режима остаются обычными", () => {
    const { api } = mode([]);
    expect(api.mark(side)).toBe(side);
    api.toggle();
    expect(api.mark(side)).toEqual({ ...side, construction: true });
    api.reset();
    expect(api.enabled.value).toBe(false);
  });

  it("X с выделением переключает выбранное, без выделения - режим", () => {
    const withSelection = mode(["side"]);
    expect(withSelection.api.selectionAction.value).toBe("Сделать вспомогательной");
    withSelection.api.toggleSelectionOrMode();
    expect(withSelection.calls).toEqual(["selected"]);
    expect(withSelection.api.enabled.value).toBe(false);

    const empty = mode([]);
    empty.api.toggleSelectionOrMode();
    expect(empty.calls).toEqual(["mode"]);
    expect(empty.api.enabled.value).toBe(true);
  });

  it("у полностью вспомогательного выделения действие - сделать обычной", () => {
    expect(mode(["side"], [{ ...side, construction: true }]).api.selectionAction.value).toBe("Сделать обычной");
  });
});
