import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { ComponentEntry } from "./useDocumentModel";
import { isSketchOutlineShown } from "@/lib/sketchVisibility";
import { useSketchOutlineSync } from "./useSketchOutlineSync";

const line = { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
const basis = (height: number) => ({ origin: [0, 0, height], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });
const onFace = (height: number): ComponentEntry => ({
  id: "s2", plane: "XY", plane_offset: height, plane_basis: basis(height), entities: [line],
});
const onBase: ComponentEntry = { id: "s1", plane: "XZ", entities: [] };

function setup(initial: ComponentEntry[]) {
  const addSketchOutline = vi.fn();
  const removeSketchOutline = vi.fn();
  const sketches = ref(initial);
  const used = ref(new Set<string>());
  const inOperation = ref(new Set<string>());
  const shown = (sketch: ComponentEntry) =>
    isSketchOutlineShown({ visible: sketch.visible, used: used.value.has(sketch.id), inOperation: inOperation.value.has(sketch.id) });
  const scope = effectScope();
  const outlines = scope.run(() => useSketchOutlineSync(ref({ addSketchOutline, removeSketchOutline }), sketches, shown))!;
  return { addSketchOutline, removeSketchOutline, sketches, used, inOperation, outlines, stop: () => scope.stop() };
}

describe("useSketchOutlineSync", () => {
  it("рисует контуры всех эскизов с их плоскостями", () => {
    const { addSketchOutline, outlines, stop } = setup([onBase, onFace(10)]);

    outlines.drawAll();
    stop();

    expect(addSketchOutline.mock.calls).toEqual([
      ["s1", [], { plane: "XZ", offset: 0, basis: null }],
      ["s2", [line], { plane: "XY", offset: 10, basis: basis(10) }],
    ]);
  });

  it("перерисовывает контур эскиза, плоскость которого переехала в документе", async () => {
    const { addSketchOutline, sketches, stop } = setup([onBase, onFace(10)]);

    sketches.value = [{ ...onBase }, onFace(30)];
    await nextTick();
    stop();

    expect(addSketchOutline.mock.calls).toEqual([["s2", [line], { plane: "XY", offset: 30, basis: basis(30) }]]);
  });

  it("не трогает сцену, когда плоскости не изменились или эскиз только появился", async () => {
    const { addSketchOutline, sketches, stop } = setup([onBase]);

    sketches.value = [{ ...onBase, entities: [line] }, onFace(10)];
    await nextTick();
    stop();

    expect(addSketchOutline).not.toHaveBeenCalled();
  });

  it("не рисует скрытые эскизы", () => {
    const { addSketchOutline, outlines, stop } = setup([{ ...onBase, visible: false }, onFace(10)]);

    outlines.drawAll();
    stop();

    expect(addSketchOutline.mock.calls.map(([id]) => id)).toEqual(["s2"]);
  });

  it("убирает контур при скрытии и рисует заново при показе", async () => {
    const { addSketchOutline, removeSketchOutline, sketches, stop } = setup([onFace(10)]);

    sketches.value = [{ ...onFace(10), visible: false }];
    await nextTick();
    expect(removeSketchOutline.mock.calls).toEqual([["s2"]]);
    expect(addSketchOutline).not.toHaveBeenCalled();

    sketches.value = [{ ...onFace(10), visible: true }];
    await nextTick();
    stop();

    expect(addSketchOutline.mock.calls).toEqual([["s2", [line], { plane: "XY", offset: 10, basis: basis(10) }]]);
    expect(removeSketchOutline).toHaveBeenCalledTimes(1);
  });

  it("не рисует скрытый эскиз, когда его плоскость переехала", async () => {
    const { addSketchOutline, removeSketchOutline, sketches, stop } = setup([{ ...onFace(10), visible: false }]);

    sketches.value = [{ ...onFace(30), visible: false }];
    await nextTick();
    stop();

    expect(addSketchOutline).not.toHaveBeenCalled();
    expect(removeSketchOutline).not.toHaveBeenCalled();
  });

  it("прячет эскиз, который потребила операция, и возвращает его после отмены операции", async () => {
    const { addSketchOutline, removeSketchOutline, used, stop } = setup([onFace(10)]);

    used.value = new Set(["s2"]);
    await nextTick();
    expect(removeSketchOutline.mock.calls).toEqual([["s2"]]);

    used.value = new Set();
    await nextTick();
    stop();

    expect(addSketchOutline.mock.calls.map(([id]) => id)).toEqual(["s2"]);
  });

  it("не рисует использованные эскизы при загрузке, кроме явно показанных", () => {
    const { addSketchOutline, used, outlines, stop } = setup([onBase, { ...onFace(10), visible: true }]);
    used.value = new Set(["s1", "s2"]);

    outlines.drawAll();
    stop();

    expect(addSketchOutline.mock.calls.map(([id]) => id)).toEqual(["s2"]);
  });

  it("рисует использованный эскиз, пока он выбран в панели операции", async () => {
    const { addSketchOutline, removeSketchOutline, used, inOperation, stop } = setup([onFace(10)]);
    used.value = new Set(["s2"]);
    await nextTick();

    inOperation.value = new Set(["s2"]);
    await nextTick();
    expect(addSketchOutline.mock.calls.map(([id]) => id)).toEqual(["s2"]);

    inOperation.value = new Set();
    await nextTick();
    stop();

    expect(removeSketchOutline).toHaveBeenCalledTimes(2);
  });
});
