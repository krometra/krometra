import { describe, expect, it } from "vitest";
import {
  NAVIGATION_PRESETS,
  isNavigationPresetId,
  mouseDragAction,
  orbitButtonFor,
  presetHints,
  type NavigationPresetId,
  type PointerButtonInput,
} from "./navigationPresets";

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;

function press(button: number, modifiers: Partial<PointerButtonInput> = {}): PointerButtonInput {
  return { button, shiftKey: false, ctrlKey: false, metaKey: false, ...modifiers };
}

function actions(id: NavigationPresetId) {
  return {
    left: mouseDragAction(id, press(LEFT)),
    middle: mouseDragAction(id, press(MIDDLE)),
    right: mouseDragAction(id, press(RIGHT)),
    shiftMiddle: mouseDragAction(id, press(MIDDLE, { shiftKey: true })),
    ctrlMiddle: mouseDragAction(id, press(MIDDLE, { ctrlKey: true })),
    ctrlRight: mouseDragAction(id, press(RIGHT, { ctrlKey: true })),
  };
}

describe("пресеты навигации мышью", () => {
  it("Крометра повторяет OrbitControls по умолчанию: ЛКМ вращает, СКМ зумит, ПКМ панорамирует", () => {
    expect(actions("krometra")).toMatchObject({ left: "rotate", middle: "zoom", right: "pan" });
    expect(mouseDragAction("krometra", press(LEFT, { shiftKey: true }))).toBe("pan");
    expect(mouseDragAction("krometra", press(LEFT, { metaKey: true }))).toBe("pan");
    expect(mouseDragAction("krometra", press(RIGHT, { ctrlKey: true }))).toBe("rotate");
  });

  it("Fusion 360: СКМ панорамирует, Shift+СКМ вращает, ЛКМ и ПКМ свободны для выбора и меню", () => {
    expect(actions("fusion")).toMatchObject({ left: null, right: null, middle: "pan", shiftMiddle: "rotate", ctrlMiddle: "pan" });
  });

  it("SolidWorks: СКМ вращает, Ctrl+СКМ панорамирует, Shift+СКМ зумит", () => {
    expect(actions("solidworks")).toMatchObject({ left: null, right: null, middle: "rotate", ctrlMiddle: "pan", shiftMiddle: "zoom" });
  });

  it("КОМПАС-3D: СКМ вращает, Shift+СКМ сдвигает, Ctrl+СКМ масштабирует", () => {
    expect(actions("kompas")).toMatchObject({ left: null, right: null, middle: "rotate", shiftMiddle: "pan", ctrlMiddle: "zoom" });
  });

  it("Onshape: ПКМ вращает, Ctrl+ПКМ и СКМ панорамируют", () => {
    expect(actions("onshape")).toMatchObject({ left: null, right: "rotate", ctrlRight: "pan", middle: "pan" });
  });

  it("кнопки кроме трёх основных камеру не трогают", () => {
    for (const preset of NAVIGATION_PRESETS) expect(mouseDragAction(preset.id, press(3))).toBeNull();
  });
});

describe("кнопка OrbitControls под действие", () => {
  it("без модификаторов действие переходит напрямую", () => {
    expect(orbitButtonFor("rotate", press(MIDDLE))).toBe("ROTATE");
    expect(orbitButtonFor("pan", press(MIDDLE))).toBe("PAN");
    expect(orbitButtonFor("zoom", press(MIDDLE))).toBe("DOLLY");
    expect(orbitButtonFor(null, press(LEFT))).toBe("NONE");
  });

  it("с модификатором вращение и панорама меняются местами: OrbitControls сам меняет их обратно", () => {
    expect(orbitButtonFor("rotate", press(MIDDLE, { shiftKey: true }))).toBe("PAN");
    expect(orbitButtonFor("pan", press(MIDDLE, { ctrlKey: true }))).toBe("ROTATE");
    expect(orbitButtonFor("zoom", press(MIDDLE, { shiftKey: true }))).toBe("DOLLY");
  });

  it("Крометра даёт ровно те же кнопки, что OrbitControls по умолчанию", () => {
    const left = press(LEFT, { shiftKey: true });
    expect(orbitButtonFor(mouseDragAction("krometra", left), left)).toBe("ROTATE");
    expect(orbitButtonFor(mouseDragAction("krometra", press(LEFT)), press(LEFT))).toBe("ROTATE");
    expect(orbitButtonFor(mouseDragAction("krometra", press(RIGHT)), press(RIGHT))).toBe("PAN");
    expect(orbitButtonFor(mouseDragAction("krometra", press(MIDDLE)), press(MIDDLE))).toBe("DOLLY");
  });
});

describe("подсказки и идентификаторы", () => {
  it("подсказка перечисляет привязки пресета и зум колесом", () => {
    expect(presetHints("fusion")).toEqual(["СКМ - панорама", "Shift+СКМ - вращение", "Колесо - зум к курсору"]);
  });

  it("узнаёт только известные пресеты", () => {
    expect(isNavigationPresetId("onshape")).toBe(true);
    expect(isNavigationPresetId("catia")).toBe(false);
    expect(isNavigationPresetId(null)).toBe(false);
  });
});
