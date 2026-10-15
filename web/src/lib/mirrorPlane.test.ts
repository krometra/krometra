import { describe, expect, it } from "vitest";
import {
  basePlaneFrame,
  isMirrorBasePlane,
  mirrorDetail,
  mirroredFaceName,
  mirrorFormFields,
  mirrorLabel,
  mirrorParams,
  mirrorPlaneOfParams,
  reflectionMatrix,
  type MirrorFrame,
} from "./mirrorPlane";
import type { Vec3 } from "./threadGeometry";

function reflect(point: Vec3, frame: MirrorFrame): number[] {
  const m = reflectionMatrix(frame);
  return [0, 1, 2].map((row) => m[row * 4] * point[0] + m[row * 4 + 1] * point[1] + m[row * 4 + 2] * point[2] + m[row * 4 + 3]);
}

describe("плоскость зеркала", () => {
  it("строит базовые плоскости со смещением вдоль нормали", () => {
    expect(basePlaneFrame("XY", 5)).toEqual({ origin: [0, 0, 5], normal: [0, 0, 1] });
    expect(basePlaneFrame("XZ", -2)).toEqual({ origin: [-0, -2, -0], normal: [0, 1, 0] });
    expect(basePlaneFrame("YZ", 0).normal).toEqual([1, 0, 0]);
    expect(isMirrorBasePlane("YZ")).toBe(true);
    expect(isMirrorBasePlane("ZX")).toBe(false);
  });

  it("матрица отражает точки через плоскость и оставляет точки плоскости на месте", () => {
    expect(reflect([3, 1, 2], basePlaneFrame("YZ", 0))).toEqual([-3, 1, 2]);
    expect(reflect([0, 0, 1], basePlaneFrame("XY", 5))).toEqual([0, 0, 9]);
    const tilted = { origin: [1, 1, 0] as Vec3, normal: [1, 1, 0] as Vec3 };
    reflect([1, 1, 0], tilted).forEach((value, index) => expect(value).toBeCloseTo([1, 1, 0][index], 9));
    reflect([0, 0, 3], tilted).forEach((value, index) => expect(value).toBeCloseTo([2, 2, 3][index], 9));
    expect(() => reflectionMatrix({ origin: [0, 0, 0], normal: [0, 0, 0] })).toThrow("нулевой");
  });

  it("называет грани отражения от ключа операции и имени исходной грани", () => {
    expect(mirroredFaceName("k-1", "f-a")).toBe(mirroredFaceName("k-1", "f-a"));
    expect(mirroredFaceName("k-1", "f-a")).not.toBe(mirroredFaceName("k-2", "f-a"));
    expect(mirroredFaceName("k-1", "f-a")).not.toBe(mirroredFaceName("k-1", "f-b"));
    expect(mirroredFaceName("k-1", "f-a")).toMatch(/^f-/);
  });

  it("передаёт серверу либо базовую плоскость со смещением, либо грань", () => {
    expect(mirrorFormFields("b1", { kind: "base", plane: "XZ", offset: -1.5 }, true, 7)).toEqual({
      body_id: "b1", plane: "XZ", offset: "-1.5", merge: "true", document_version: "7",
    });
    expect(mirrorFormFields("b1", { kind: "face", faceId: "f-x" }, false, 2)).toEqual({
      body_id: "b1", face_id: "f-x", merge: "false", document_version: "2",
    });
  });

  it("читает плоскость из параметров истории: грань важнее базовой плоскости", () => {
    expect(mirrorPlaneOfParams({ plane: "XZ", offset: 4 })).toEqual({ kind: "base", plane: "XZ", offset: 4 });
    expect(mirrorPlaneOfParams({ face_id: "f-x", plane: null })).toEqual({ kind: "face", faceId: "f-x" });
    expect(mirrorPlaneOfParams({ plane: "bad", offset: Number.NaN })).toEqual({ kind: "base", plane: "XY", offset: 0 });
  });

  it("подписывает операцию и её параметры по-русски", () => {
    expect(mirrorLabel({ kind: "base", plane: "XY", offset: 0 }, false)).toBe("Зеркало XY");
    expect(mirrorLabel({ kind: "base", plane: "YZ", offset: -2.5 }, true)).toBe("Зеркало YZ -2.5 мм, с объединением");
    expect(mirrorLabel({ kind: "face", faceId: "f-x" }, false)).toBe("Зеркало по грани");
    expect(mirrorDetail({ plane: "XZ", offset: 3, merge: true })).toBe("XZ +3 мм · объед.");
    expect(mirrorParams({ face_id: "f-x", merge: false })).toEqual([
      { label: "Плоскость", value: "Плоская грань тела" },
      { label: "Смещение", value: "—" },
      { label: "Результат", value: "Новое тело" },
    ]);
  });
});
