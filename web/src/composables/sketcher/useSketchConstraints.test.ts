import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { SketchConstraint, SketchEntity } from "@/types/api";
import { useSketchConstraints } from "./useSketchConstraints";

const line = (id: string): SketchEntity => ({ id, type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 1 } });

function setup(selected: string[]) {
  const added: { constraint: SketchConstraint; silent?: boolean }[] = [];
  let counter = 0;
  const deps = {
    entities: ref<SketchEntity[]>([line("a"), line("b"), line("c")]),
    selectedEntityIds: ref<string[]>(selected),
    nextConstraintId: () => `c${++counter}`,
    addConstraint: vi.fn((constraint: SketchConstraint, opts?: { silent?: boolean }) => {
      added.push({ constraint, silent: opts?.silent });
    }),
    clearSelection: vi.fn(),
    solveAndApply: vi.fn(),
    openDimension: vi.fn(),
  };
  return { api: useSketchConstraints(deps), deps, added };
}

describe("useSketchConstraints для нескольких объектов", () => {
  it("equal трёх отрезков: два ограничения и одна запись истории", () => {
    const { api, deps, added } = setup(["a", "b", "c"]);
    api.create("equal");

    expect(added.map(({ constraint }) => constraint.anchors.map((a) => a.entity_id))).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(added.every(({ silent }) => silent)).toBe(true);
    expect(deps.solveAndApply).toHaveBeenCalledTimes(1);
    expect(deps.clearSelection).toHaveBeenCalledTimes(1);
  });

  it("vertical трёх отрезков: по ограничению на каждый", () => {
    const { api, added } = setup(["a", "b", "c"]);
    api.create("vertical");
    expect(added.map(({ constraint }) => constraint.anchors)).toEqual([
      [{ entity_id: "a", sub_index: 0 }],
      [{ entity_id: "b", sub_index: 0 }],
      [{ entity_id: "c", sub_index: 0 }],
    ]);
  });

  it("неопределённое для трёх объектов ограничение недоступно и объясняет почему", () => {
    const { api, deps } = setup(["a", "b", "c"]);
    expect(api.canApply("perpendicular")).toBe(false);
    expect(api.title("perpendicular")).toContain("недоступно: только для двух отрезков, выбрано 3");
    expect(api.canApply("distance")).toBe(false);

    api.create("perpendicular");
    api.create("distance");
    expect(deps.addConstraint).not.toHaveBeenCalled();
    expect(deps.openDimension).not.toHaveBeenCalled();
  });

  it("размер для двух параллельных отрезков открывает поле расстояния между ними", () => {
    const { api, deps } = setup(["a", "b"]);
    api.create("distance");
    expect(deps.openDimension).toHaveBeenCalledWith({
      type: "line_distance",
      anchors: [{ entity_id: "a", sub_index: 0 }, { entity_id: "b", sub_index: 0 }],
      value: 0,
    });
    expect(deps.addConstraint).not.toHaveBeenCalled();
  });

  it("размер для одного отрезка открывает поле длины", () => {
    const { api, deps } = setup(["c"]);
    api.create("distance");
    expect(deps.openDimension).toHaveBeenCalledWith(expect.objectContaining({ type: "length", value: Math.hypot(10, 1) }));
  });

  it("удалённый из эскиза объект в выделении блокирует ограничения", () => {
    const { api } = setup(["a", "gone"]);
    expect(api.canApply("coincident")).toBe(false);
  });
});
