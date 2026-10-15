import { describe, expect, it } from "vitest";
import { requestedMirrorPlane } from "./mirrorRequest";
import { ControlError } from "./protocol";

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof ControlError ? error.code : "other";
  }
}

describe("requestedMirrorPlane", () => {
  it("собирает базовую плоскость со смещением по умолчанию 0", () => {
    expect(requestedMirrorPlane("XZ", undefined, undefined)).toEqual({ kind: "base", plane: "XZ", offset: 0 });
    expect(requestedMirrorPlane("YZ", -4, undefined)).toEqual({ kind: "base", plane: "YZ", offset: -4 });
  });

  it("собирает плоскость грани", () => {
    expect(requestedMirrorPlane(undefined, undefined, "f-cap")).toEqual({ kind: "face", faceId: "f-cap" });
  });

  it("требует ровно одну плоскость и не смещает грань", () => {
    expect(codeOf(() => requestedMirrorPlane(undefined, undefined, undefined))).toBe("invalid_params");
    expect(codeOf(() => requestedMirrorPlane("XY", undefined, "f-cap"))).toBe("invalid_params");
    expect(codeOf(() => requestedMirrorPlane(undefined, 3, "f-cap"))).toBe("invalid_params");
  });
});
