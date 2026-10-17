import { describe, expect, it } from "vitest";
import { loftParamRows, loftSummary } from "./loftFeature";

describe("подписи лофта", () => {
  const params = { profile_sketch_ids: ["s1", "s2", "s3"], transition: "ruled", operation: "cut" };

  it("кратко описывает лофт на ленте истории", () => {
    expect(loftSummary(params)).toBe("3 проф. · линейный");
    expect(loftSummary({})).toBe("0 проф. · гладкий");
  });

  it("перечисляет профили по порядку, переход и операцию в свойствах", () => {
    expect(loftParamRows(params, (id) => id.toUpperCase())).toEqual([
      { label: "Профили", value: "S1 → S2 → S3" },
      { label: "Переход", value: "Линейный" },
      { label: "Операция", value: "Вырезать" },
    ]);
  });
});
