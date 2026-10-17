import { describe, expect, it } from "vitest";
import { isSketchOutlineShown, isSketchVisible } from "./sketchVisibility";

describe("isSketchVisible", () => {
  it("показывает эскиз, по которому ещё ничего не построено", () => {
    expect(isSketchVisible({ used: false })).toBe(true);
  });

  it("прячет эскиз, потреблённый операцией, если видимость не выбрана явно", () => {
    expect(isSketchVisible({ used: true })).toBe(false);
    expect(isSketchVisible({ visible: null, used: true })).toBe(false);
  });

  it("явный выбор глазом в дереве сильнее автоматики", () => {
    expect(isSketchVisible({ visible: true, used: true })).toBe(true);
    expect(isSketchVisible({ visible: false, used: false })).toBe(false);
  });
});

describe("isSketchOutlineShown", () => {
  it("рисует эскиз, выбранный в панели операции, даже если он скрыт", () => {
    expect(isSketchOutlineShown({ used: true, inOperation: true })).toBe(true);
    expect(isSketchOutlineShown({ visible: false, used: false, inOperation: true })).toBe(true);
  });

  it("вне операции следует видимости эскиза", () => {
    expect(isSketchOutlineShown({ used: true, inOperation: false })).toBe(false);
    expect(isSketchOutlineShown({ used: false, inOperation: false })).toBe(true);
  });
});
