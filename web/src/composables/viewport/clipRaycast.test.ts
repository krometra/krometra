import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { unclippedHits, visibleBodyHits } from "./clipRaycast";
import type { SceneContext } from "./types";

function contextWith(planes: THREE.Plane[], from: THREE.Vector3, to: THREE.Vector3): SceneContext {
  const raycaster = new THREE.Raycaster(from, to.clone().sub(from).normalize());
  return {
    renderer: () => ({ clippingPlanes: planes }) as never,
    scene: () => new THREE.Scene(),
    camera: () => new THREE.PerspectiveCamera(),
    controls: () => ({ target: new THREE.Vector3(), update: () => {} }),
    raycaster: () => raycaster,
    pointer: () => new THREE.Vector2(),
    meshGroup: new THREE.Group(),
    entries: [],
    ready: () => true,
  };
}

const box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));

function hits(context: SceneContext) {
  return context.raycaster().intersectObject(box, false);
}

const keepBelowZero = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

describe("clipRaycast", () => {
  it("без сечения попадания не трогает", () => {
    const context = contextWith([], new THREE.Vector3(1, 2, 50), new THREE.Vector3(1, 2, 0));
    expect(visibleBodyHits(context, hits(context))).toHaveLength(2);
  });

  it("отсечённая часть тела не ловит луч", () => {
    const context = contextWith([keepBelowZero], new THREE.Vector3(2, -50, 3), new THREE.Vector3(2, 0, 3));
    expect(hits(context)).toHaveLength(2);
    expect(unclippedHits(context, hits(context))).toHaveLength(0);
  });

  it("луч в заливку среза не выбирает внутреннюю стенку за ней", () => {
    const context = contextWith([keepBelowZero], new THREE.Vector3(1, 2, 50), new THREE.Vector3(1, 2, 0));
    const kept = unclippedHits(context, hits(context));
    expect(kept).toHaveLength(1);
    expect(kept[0].point.z).toBeCloseTo(-5);
    expect(visibleBodyHits(context, hits(context))).toHaveLength(0);
  });

  it("уцелевшая наружная грань выбирается как обычно", () => {
    const context = contextWith([keepBelowZero], new THREE.Vector3(2, -50, -3), new THREE.Vector3(2, 0, -3));
    const visible = visibleBodyHits(context, hits(context));
    expect(visible).toHaveLength(2);
    expect(visible[0].point.y).toBeCloseTo(-5);
  });
});
