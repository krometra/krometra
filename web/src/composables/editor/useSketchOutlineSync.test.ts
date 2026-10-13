import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { ComponentEntry } from "./useDocumentModel";
import { useSketchOutlineSync } from "./useSketchOutlineSync";

const line = { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
const basis = (height: number) => ({ origin: [0, 0, height], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] });
const onFace = (height: number): ComponentEntry => ({
  id: "s2", plane: "XY", plane_offset: height, plane_basis: basis(height), entities: [line],
});
const onBase: ComponentEntry = { id: "s1", plane: "XZ", entities: [] };

function setup(initial: ComponentEntry[]) {
  const addSketchOutline = vi.fn();
  const sketches = ref(initial);
  const scope = effectScope();
  const outlines = scope.run(() => useSketchOutlineSync(ref({ addSketchOutline }), sketches))!;
  return { addSketchOutline, sketches, outlines, stop: () => scope.stop() };
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
});
