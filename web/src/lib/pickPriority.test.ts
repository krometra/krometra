import { describe, it, expect } from "vitest";
import { planeHelperWins } from "./pickPriority";

describe("planeHelperWins", () => {
  it("нет попадания в хелпер — выигрывает тело", () => {
    expect(planeHelperWins(null, 10)).toBe(false);
    expect(planeHelperWins(Infinity, 10)).toBe(false);
  });

  it("нет попадания в тело — выигрывает хелпер", () => {
    expect(planeHelperWins(10, null)).toBe(true);
    expect(planeHelperWins(10, Infinity)).toBe(true);
  });

  it("тело под хелпером всё равно выигрывает — хелпер накрывает деталь целиком", () => {
    expect(planeHelperWins(5, 10)).toBe(false);
  });

  it("грань компланарна хелперу — выигрывает грань, а не float-погрешность", () => {
    expect(planeHelperWins(100 - 1e-9, 100)).toBe(false);
    expect(planeHelperWins(100 + 1e-9, 100)).toBe(false);
  });

  it("тело ближе — выигрывает тело", () => {
    expect(planeHelperWins(20, 10)).toBe(false);
  });

  it("промах по обоим — никто не выигрывает", () => {
    expect(planeHelperWins(null, null)).toBe(false);
  });
});
