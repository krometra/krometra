import { describe, expect, it } from "vitest";
import { readDraftNeutral } from "./draftNeutral";
import { INVALID } from "./params";

describe("readDraftNeutral", () => {
  it("базовая плоскость и грань", () => {
    expect(readDraftNeutral({ plane: "XZ" })).toEqual({ kind: "base", plane: "XZ" });
    expect(readDraftNeutral({ faceId: "f-abc" })).toEqual({ kind: "face", faceId: "f-abc" });
    expect(readDraftNeutral({ faceId: 7 })).toEqual({ kind: "face", faceId: "7" });
  });

  it("отклоняет пустое, двойное и неизвестное", () => {
    expect(readDraftNeutral({})).toBe(INVALID);
    expect(readDraftNeutral({ plane: "XY", faceId: "f-a" })).toBe(INVALID);
    expect(readDraftNeutral({ plane: "XW" })).toBe(INVALID);
    expect(readDraftNeutral({ faceId: "" })).toBe(INVALID);
    expect(readDraftNeutral({ normal: [0, 0, 1] })).toBe(INVALID);
  });
});
