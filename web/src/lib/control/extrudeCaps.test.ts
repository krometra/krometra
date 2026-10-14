import { describe, expect, it } from "vitest";
import { extrudeCaps } from "./extrudeCaps";
import { describeBodyTopology } from "./topology";
import { C, boxMesh } from "./topologyFixtures";

const faces = () => describeBodyTopology("body-1", boxMesh()).faces;

describe("extrudeCaps", () => {
  it("находит торец на конце выдавливания и основание в плоскости эскиза", () => {
    expect(extrudeCaps(faces(), { origin: [0, 0, 0], n: [0, 0, 1] }, { start: 0, end: C })).toEqual({
      capFaceIds: ["top"],
      baseFaceIds: ["bottom"],
    });
  });

  it("симметричное выдавливание даёт два торца и без основания", () => {
    expect(extrudeCaps(faces(), { origin: [0, 0, C / 2], n: [0, 0, 1] }, { start: -C / 2, end: C / 2 })).toEqual({
      capFaceIds: ["bottom", "top"],
      baseFaceIds: [],
    });
  });

  it("выдавливание против нормали находит торец снизу", () => {
    expect(extrudeCaps(faces(), { origin: [0, 0, C], n: [0, 0, 1] }, { start: -C, end: 0 }).capFaceIds).toEqual(["bottom"]);
  });
});
