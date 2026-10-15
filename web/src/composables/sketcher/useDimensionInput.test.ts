import { describe, expect, it, vi } from "vitest";
import type { SketchConstraint } from "@/types/api";
import { useDimensionInput } from "./useDimensionInput";

function setup() {
  const create = vi.fn();
  const update = vi.fn();
  const input = useDimensionInput({
    variables: () => ({ gap: { value: 20, dimension: "length" } }),
    create,
    update,
  });
  return { input, create, update };
}

const draft = { type: "line_distance" as const, anchors: [{ entity_id: "a", sub_index: 0 }, { entity_id: "b", sub_index: 0 }], value: 12.3456 };

describe("useDimensionInput", () => {
  it("открывается с текущим значением и заголовком типа", () => {
    const { input } = setup();
    input.openCreate(draft, { x: 10, y: 20 });
    expect(input.state.value).toMatchObject({ x: 10, y: 20, title: "Расстояние между отрезками" });
    expect(input.state.value?.field.text.value).toBe("12.346");
  });

  it("Enter создаёт размер со значением выражения в мм", () => {
    const { input, create } = setup();
    input.openCreate(draft, { x: 0, y: 0 });
    input.type("1 in - 5.4mm");
    input.confirm();
    expect(create).toHaveBeenCalledWith(draft, expect.closeTo(20, 9));
    expect(input.state.value).toBeNull();
  });

  it("параметры документа доступны в выражении", () => {
    const { input, create } = setup();
    input.openCreate(draft, { x: 0, y: 0 });
    input.type("gap * 1.5");
    input.confirm();
    expect(create).toHaveBeenCalledWith(draft, 30);
  });

  it("угол понимает радианы и не принимает миллиметры", () => {
    const { input, create } = setup();
    input.openCreate({ type: "angle", anchors: [], value: 30 }, { x: 0, y: 0 });
    input.type("10 mm");
    expect(input.state.value?.field.error.value).toMatch(/угла/);
    input.confirm();
    expect(create).not.toHaveBeenCalled();
    expect(input.state.value).not.toBeNull();
    input.type(`${Math.PI / 4} rad`);
    input.confirm();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: "angle" }), expect.closeTo(45, 9));
  });

  it("неверное значение не закрывает поле", () => {
    const { input, create } = setup();
    input.openCreate({ type: "length", anchors: [], value: 5 }, { x: 0, y: 0 });
    input.type("0");
    input.confirm();
    expect(input.state.value?.field.error.value).toMatch(/больше нуля/);
    expect(create).not.toHaveBeenCalled();
  });

  it("правка существующего размера вызывает обновление по id", () => {
    const { input, update, create } = setup();
    const constraint: SketchConstraint = { id: "c1", type: "length", anchors: [{ entity_id: "a", sub_index: 0 }], value: 20 };
    expect(input.openEdit(constraint, { x: 0, y: 0 })).toBe(true);
    expect(input.state.value?.field.text.value).toBe("20");
    input.type("30");
    input.confirm();
    expect(update).toHaveBeenCalledWith("c1", 30);
    expect(create).not.toHaveBeenCalled();
  });

  it("геометрическое ограничение не редактируется, Esc закрывает без изменений", () => {
    const { input, update } = setup();
    expect(input.openEdit({ id: "p", type: "parallel", anchors: [], value: null }, { x: 0, y: 0 })).toBe(false);
    expect(input.state.value).toBeNull();
    input.openEdit({ id: "c1", type: "diameter", anchors: [], value: 10 }, { x: 0, y: 0 });
    input.cancel();
    expect(input.state.value).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
