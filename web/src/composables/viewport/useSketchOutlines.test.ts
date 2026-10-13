import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SKETCH_OUTLINE_LIFT_MM, frameNormal, liftedOutlinePoints } from "./useSketchOutlines";

describe("liftedOutlinePoints", () => {
  it("приподнимает контур над гранью по её наружной нормали", () => {
    const normal = frameNormal({ basis: { origin: [0, 0, 5], u: [1, 0, 0], v: [0, -1, 0], n: [0, 0, -1] } });
    const points = liftedOutlinePoints([new THREE.Vector3(1, 2, 5), new THREE.Vector3(3, 4, 5)], normal);

    expect(points).toEqual([1, 2, 5 - SKETCH_OUTLINE_LIFT_MM, 3, 4, 5 - SKETCH_OUTLINE_LIFT_MM]);
  });
});
