import { describe, expect, it } from "vitest";
import { loftGeneratedFaces } from "./browserLoftNaming";

describe("имена граней лофта", () => {
  it("называет боковые грани по стороне первого профиля, торцы - start и end", () => {
    expect(loftGeneratedFaces([{ key: "sq.0", faces: [2] }, { key: "sq.1", faces: [3] }], 0, 1)).toEqual([
      { key: "side:sq.0", images: [2] },
      { key: "side:sq.1", images: [3] },
      { key: "start", images: [0] },
      { key: "end", images: [1] },
    ]);
  });

  it("сводит грани одной стороны, разбитой на части, и не отдает торцы боковым именам", () => {
    expect(loftGeneratedFaces([{ key: "c", faces: [2, 3] }, { key: "c", faces: [3, 4, 0] }, { key: null, faces: [5] }], 0, 1)).toEqual([
      { key: "side:c", images: [2, 3, 4] },
      { key: "start", images: [0] },
      { key: "end", images: [1] },
    ]);
  });

  it("пропускает торец, которого нет в результате", () => {
    expect(loftGeneratedFaces([], -1, 4)).toEqual([{ key: "end", images: [4] }]);
  });
});
