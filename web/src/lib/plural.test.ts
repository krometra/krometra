import { describe, expect, it } from "vitest";
import { plural, pluralize } from "./plural";

describe("plural", () => {
  it("выбирает форму по последней цифре", () => {
    expect(plural(1, "тело", "тела", "тел")).toBe("тело");
    expect(plural(2, "тело", "тела", "тел")).toBe("тела");
    expect(plural(5, "тело", "тела", "тел")).toBe("тел");
    expect(plural(21, "тело", "тела", "тел")).toBe("тело");
    expect(plural(102, "тело", "тела", "тел")).toBe("тела");
  });

  it("исключает подростковые числа 11–14", () => {
    for (const n of [11, 12, 13, 14, 111, 112]) {
      expect(plural(n, "тело", "тела", "тел")).toBe("тел");
    }
  });

  it("ноль — форма many", () => {
    expect(plural(0, "операция", "операции", "операций")).toBe("операций");
  });

  it("pluralize добавляет число", () => {
    expect(pluralize(3, "грань", "грани", "граней")).toBe("3 грани");
  });
});
