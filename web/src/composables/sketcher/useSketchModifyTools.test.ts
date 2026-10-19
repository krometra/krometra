import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { SketchConstraint, SketchEntity } from "@/types/api";
import type { SketchTool } from "@/composables/shared/useSketch";
import { useFilletTool } from "./useFilletTool";
import { useTrimTool } from "./useTrimTool";

const line = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
});

function sketchStub(entities: SketchEntity[]) {
  let n = 0;
  const sketch = {
    entities: ref<SketchEntity[]>(entities),
    constraints: ref<SketchConstraint[]>([]),
    nextEntityId: () => `e${n++}`,
    nextConstraintId: () => `c${n++}`,
    applyEdit: vi.fn((edit: { entities: SketchEntity[]; constraints: SketchConstraint[] }) => {
      sketch.entities.value = edit.entities;
      sketch.constraints.value = edit.constraints;
    }),
  };
  return sketch;
}

const corner = () => [line("a", 0, 0, 20, 0), line("b", 20, 0, 20, 20)];

function fillet(entities: SketchEntity[]) {
  const sketch = sketchStub(entities);
  const tool = useFilletTool({ tool: ref<SketchTool>("fillet"), sketch, zoom: () => 1, canvasRect: () => undefined });
  return { sketch, tool };
}

describe("инструмент скругления", () => {
  it("наведение на угол показывает маркер", () => {
    const { tool } = fillet(corner());
    tool.move({ x: 19, y: 1 });
    expect(tool.marker.value?.at).toEqual({ x: 20, y: 0 });
  });

  it("клик по углу открывает радиус с подсказкой и превью дуги", () => {
    const { tool } = fillet(corner());
    tool.click({ x: 20, y: 0 }, { x: 100, y: 100 });
    expect(tool.prompt.value?.field.value.value).toBe(4);
    expect(tool.preview.value).toMatchObject({ type: "arc", radius: 4 });
  });

  it("подтверждение применяет скругление, следующий угол предлагает тот же радиус", () => {
    const { tool, sketch } = fillet([...corner(), line("c", 20, 20, 0, 20)]);
    tool.click({ x: 20, y: 0 }, { x: 0, y: 0 });
    tool.type("3");
    tool.confirm();
    expect(sketch.applyEdit).toHaveBeenCalledOnce();
    expect(sketch.entities.value.filter((e) => e.type === "arc")).toHaveLength(1);
    expect(tool.prompt.value).toBeNull();
    tool.click({ x: 20, y: 20 }, { x: 0, y: 0 });
    expect(tool.prompt.value?.field.value.value).toBe(3);
  });

  it("слишком большой радиус оставляет поле открытым с ошибкой", () => {
    const { tool, sketch } = fillet(corner());
    tool.click({ x: 20, y: 0 }, { x: 0, y: 0 });
    tool.type("50");
    tool.confirm();
    expect(sketch.applyEdit).not.toHaveBeenCalled();
    expect(tool.prompt.value?.field.error.value).toBe("Радиус слишком большой для этих отрезков");
  });

  it("два отрезка по очереди, Esc сбрасывает первый", () => {
    const { tool } = fillet([line("h", -10, 0, 10, 0), line("v", 0, -10, 0, 10)]);
    tool.click({ x: 5, y: 0 }, { x: 0, y: 0 });
    expect(tool.highlightedIds.value).toEqual(["h"]);
    expect(tool.cancelStep()).toBe(true);
    expect(tool.highlightedIds.value).toEqual([]);
    tool.click({ x: 5, y: 0 }, { x: 0, y: 0 });
    tool.click({ x: 0, y: 5 }, { x: 0, y: 0 });
    expect(tool.prompt.value?.sides.map((s) => s.lineId)).toEqual(["h", "v"]);
    expect(tool.cancelStep()).toBe(true);
    expect(tool.cancelStep()).toBe(false);
  });
});

describe("инструмент усечения", () => {
  it("подсвечивает удаляемый участок и удаляет его кликом", () => {
    const sketch = sketchStub([line("a", 0, 0, 10, 0), line("v", 6, -5, 6, 5)]);
    const tool = useTrimTool({ tool: ref<SketchTool>("trim"), sketch, zoom: () => 10 });
    tool.move({ x: 8, y: 0 });
    expect(tool.removal.value).toMatchObject({ start: { x: 6, y: 0 }, end: { x: 10, y: 0 } });
    tool.click({ x: 8, y: 0 });
    expect(sketch.entities.value[0]).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 6, y: 0 } });
    expect(tool.removal.value).toBeNull();
  });
});
