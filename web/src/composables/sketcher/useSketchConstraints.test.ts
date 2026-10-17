import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { SketchConstraint, SketchEntity } from "@/types/api";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN_ID } from "@/sketcher/sketchOrigin";
import { LINE_MIDPOINT } from "@/sketcher/sketchPoints";
import type { SketchSelectionItem } from "@/sketcher/sketchSelection";
import { useSketchConstraints } from "./useSketchConstraints";
import { useSketchSelection } from "./useSketchSelection";

const line = (id: string): SketchEntity => ({ id, type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 1 } });
const point = (entityId: string, subIndex: number): SketchSelectionItem => ({ kind: "point", entityId, subIndex });

function setup(selected: (string | SketchSelectionItem)[]) {
  const added: { constraint: SketchConstraint; silent?: boolean }[] = [];
  let counter = 0;
  const selection = useSketchSelection(ref<SketchEntity[]>([line("a"), line("b"), line("c")]));
  selection.set(selected.map((item) => (typeof item === "string" ? { kind: "entity", entityId: item } : item)));
  const deps = {
    selectionTargets: selection.targets,
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

  it("совпадение двух выбранных точек цепляется к их номерам", () => {
    const { api, added } = setup([point("a", 1), point("b", 0)]);
    api.create("coincident");
    expect(added.map(({ constraint }) => constraint.anchors)).toEqual([
      [{ entity_id: "a", sub_index: 1 }, { entity_id: "b", sub_index: 0 }],
    ]);
  });

  it("середина отрезка совпадает с началом координат", () => {
    const { api, added } = setup([point("c", LINE_MIDPOINT), { kind: "origin" }]);
    api.create("coincident");
    expect(added[0].constraint.anchors).toEqual([
      { entity_id: "c", sub_index: LINE_MIDPOINT },
      { entity_id: SKETCH_ORIGIN_ID, sub_index: 0 },
    ]);
  });

  it("горизонталь двух точек — одно ограничение, совпадение отрезков недоступно", () => {
    const { api, added } = setup([point("a", 1), point("b", 1)]);
    api.create("horizontal");
    expect(added.map(({ constraint }) => constraint.anchors)).toEqual([
      [{ entity_id: "a", sub_index: 1 }, { entity_id: "b", sub_index: 1 }],
    ]);
    expect(setup(["a", "b"]).api.title("coincident")).toContain("только точки");
  });

  it("параллельность отрезка оси Y", () => {
    const { api, added } = setup(["a", { kind: "axis", axis: "y" }]);
    api.create("parallel");
    expect(added[0].constraint.anchors).toEqual([
      { entity_id: "a", sub_index: 0 },
      { entity_id: SKETCH_AXIS_IDS.y, sub_index: 0 },
    ]);
  });

  it("новые кнопки на панели: коллинеарность, середина, точка на кривой, фиксация", () => {
    const { api } = setup(["a", "b"]);
    expect(api.constraintTypes).toEqual(expect.arrayContaining(["collinear", "midpoint", "point_on_curve", "fix"]));
    expect(api.label("fix")).toBe("Фикс");
    expect(api.canApply("collinear")).toBe(true);
  });

  it("фиксация трёх отрезков: каждый целиком, одна запись истории", () => {
    const { api, deps, added } = setup(["a", "b", "c"]);
    api.create("fix");
    expect(added.map(({ constraint }) => constraint.anchors)).toEqual([
      [{ entity_id: "a", sub_index: -1 }],
      [{ entity_id: "b", sub_index: -1 }],
      [{ entity_id: "c", sub_index: -1 }],
    ]);
    expect(deps.solveAndApply).toHaveBeenCalledTimes(1);
  });

  it("середина для одного отрезка недоступна и объясняет почему", () => {
    const { api } = setup(["a"]);
    expect(api.canApply("midpoint")).toBe(false);
    expect(api.title("midpoint")).toContain("недоступно: только для точки и отрезка, выбрано 1");
  });
});
