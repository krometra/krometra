import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { SketchEntity } from "@/types/api";
import { targetOfEntity, targetOfSelection } from "@/sketcher/dimensionTargets";
import { SKETCH_AXIS_IDS, SKETCH_ORIGIN_ID } from "@/sketcher/sketchOrigin";
import { LINE_MIDPOINT } from "@/sketcher/sketchPoints";
import { useDimensionTool } from "./useDimensionTool";

const entities: SketchEntity[] = [
  { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 40 } },
  { id: "b", type: "line", start: { x: 30, y: 0 }, end: { x: 30, y: 40 } },
  { id: "c", type: "circle", center: { x: 80, y: 20 }, radius: 5 },
];

function setup(list: SketchEntity[] = entities) {
  const open = vi.fn();
  const tool = useDimensionTool({
    entities: ref(list),
    zoom: () => 1,
    screenToWorld: (sx, sy) => ({ x: sx, y: sy }),
    open,
  });
  return { tool, open };
}

describe("useDimensionTool", () => {
  it("две параллельные стороны: второй клик сразу открывает ввод расстояния", () => {
    const { tool, open } = setup();
    tool.onClick(0, 12);
    expect(open).not.toHaveBeenCalled();
    expect(tool.hint.value).toMatch(/^Длина 40/);
    tool.onClick(30, 12);
    expect(open).toHaveBeenCalledWith(
      { type: "line_distance", anchors: [{ entity_id: "a", sub_index: 0 }, { entity_id: "b", sub_index: 0 }], value: 30 },
      { x: 30, y: 12 },
    );
    expect(tool.targets.value).toEqual([]);
  });

  it("отрезок и клик в пустом месте ставят длину", () => {
    const { tool, open } = setup();
    tool.onClick(0, 12);
    tool.onClick(-25, 20);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ type: "length", value: 40 }), { x: -25, y: 20 });
  });

  it("окружность сразу открывает диаметр, клик по ободу не путается с центром", () => {
    const { tool, open } = setup();
    tool.onClick(85.5, 20);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ type: "diameter", value: 10 }), { x: 85.5, y: 20 });
  });

  it("две точки: тип размера по положению курсора при клике", () => {
    const { tool, open } = setup();
    tool.onClick(0, 0);
    tool.onClick(30, 40);
    expect(open).not.toHaveBeenCalled();
    tool.onMove(15, 60);
    expect(tool.hint.value).toMatch(/по горизонтали/);
    tool.onClick(-20, 20);
    expect(open).toHaveBeenCalledWith(
      { type: "vertical_distance", anchors: [{ entity_id: "a", sub_index: 0 }, { entity_id: "b", sub_index: 1 }], value: 40 },
      { x: -20, y: 20 },
    );
  });

  it("начало координат участвует как точка", () => {
    const offset: SketchEntity[] = [{ id: "l", type: "line", start: { x: 10, y: 5 }, end: { x: 10, y: 40 } }];
    const { tool, open } = setup(offset);
    tool.onMove(0.3, 0.2);
    expect(tool.marker.value).toEqual({ at: { x: 0, y: 0 }, label: "Начало координат" });
    tool.onClick(0.3, 0.2);
    expect(tool.highlightedIds.value).toEqual([]);
    tool.onClick(10, 12);
    expect(open).toHaveBeenCalledWith(
      { type: "point_line_distance", anchors: [{ entity_id: SKETCH_ORIGIN_ID, sub_index: 0 }, { entity_id: "l", sub_index: 0 }], value: 10 },
      { x: 10, y: 12 },
    );
  });

  it("повторный клик по тому же объекту снимает выбор, клик в пустоте без размера сбрасывает", () => {
    const { tool, open } = setup();
    tool.onClick(80, 20);
    tool.onClick(80, 20);
    expect(tool.targets.value).toEqual([]);
    tool.onClick(80, 20);
    tool.onClick(200, 200);
    expect(tool.targets.value).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });

  it("недопустимая пара показывает причину, следующий клик начинает заново", () => {
    const { tool } = setup();
    tool.onClick(0, 40);
    tool.onClick(0, 12);
    expect(tool.hint.value).toBe("Размер недоступен: точка лежит на этом же отрезке");
    tool.onClick(30, 12);
    expect(tool.targets.value.map((t) => t.kind)).toEqual(["line"]);
  });

  it("подсвечены выбранный и наведённый объекты", () => {
    const { tool } = setup();
    tool.onClick(30, 12);
    tool.onMove(0, 12);
    expect(tool.highlightedIds.value).toEqual(["b", "a"]);
  });

  it("старт из выделения: две параллельные сразу открывают ввод", () => {
    const { tool, open } = setup();
    tool.startFromTargets([targetOfEntity(entities[0])!, targetOfEntity(entities[1])!], { x: 5, y: 6 });
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ type: "line_distance" }), { x: 5, y: 6 });
  });

  it("старт из выделения одного отрезка ждёт клика", () => {
    const { tool, open } = setup();
    tool.startFromTargets([targetOfEntity(entities[0])!], { x: 5, y: 6 });
    expect(open).not.toHaveBeenCalled();
    expect(tool.isPicking()).toBe(true);
  });

  it("старт из выделенной точки и оси открывает расстояние до оси", () => {
    const { tool, open } = setup();
    const point = targetOfSelection({ kind: "point", entityId: "b", subIndex: 1 }, entities)!;
    const axis = targetOfSelection({ kind: "axis", axis: "x" }, entities)!;
    tool.startFromTargets([point, axis], { x: 5, y: 6 });
    expect(open).toHaveBeenCalledWith(
      { type: "point_line_distance", anchors: [{ entity_id: "b", sub_index: 1 }, { entity_id: SKETCH_AXIS_IDS.x, sub_index: 0 }], value: 40 },
      { x: 5, y: 6 },
    );
  });

  it("середина отрезка выбирается точкой, если курсор точно на ней", () => {
    const { tool, open } = setup();
    tool.onMove(30, 20.5);
    expect(tool.marker.value).toEqual({ at: { x: 30, y: 20 }, label: "Середина" });
    tool.onClick(30, 20.5);
    tool.onClick(0.4, 0.4);
    tool.onClick(15, -30);
    expect(open).toHaveBeenCalledWith(
      { type: "horizontal_distance", anchors: [{ entity_id: "b", sub_index: LINE_MIDPOINT }, { entity_id: "a", sub_index: 0 }], value: 30 },
      { x: 15, y: -30 },
    );
  });

  it("вспомогательная линия (ребро грани) выбирается и даёт размер от неё", () => {
    const edge: SketchEntity = { id: "face-edge-7-1", type: "line", start: { x: -50, y: -10 }, end: { x: 50, y: -10 }, construction: true };
    const side: SketchEntity = { id: "s", type: "line", start: { x: -20, y: 15 }, end: { x: 20, y: 15 } };
    const { tool, open } = setup([edge, side]);
    tool.onClick(30, -10);
    tool.onClick(10, 15);
    expect(open).toHaveBeenCalledWith(
      { type: "line_distance", anchors: [{ entity_id: "face-edge-7-1", sub_index: 0 }, { entity_id: "s", sub_index: 0 }], value: 25 },
      { x: 10, y: 15 },
    );
  });

  it("ось выбирается как прямая, если рядом нет объектов", () => {
    const { tool, open } = setup();
    tool.onClick(-40, 0.5);
    expect(tool.hint.value).toBe("Выберите второй объект: точку или отрезок");
    tool.onClick(80, 20);
    expect(open).toHaveBeenCalledWith(
      { type: "point_line_distance", anchors: [{ entity_id: "c", sub_index: 0 }, { entity_id: SKETCH_AXIS_IDS.x, sub_index: 0 }], value: 20 },
      { x: 80, y: 20 },
    );
  });
});
