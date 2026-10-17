import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MeshEntry, SceneContext } from "./types";
import { useRegionPicking } from "./useRegionPicking";

const square = (x0: number, x1: number) => ({
  outer: [{ x: x0, y: -5 }, { x: x1, y: -5 }, { x: x1, y: 5 }, { x: x0, y: 5 }],
  holes: [],
});

function boxAt(z: number): MeshEntry {
  const geometry = new THREE.BoxGeometry(40, 40, 10);
  geometry.translate(0, 0, z);
  return {
    bodyId: "box",
    mesh: new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()),
    faceTriangleMap: [],
    brepTopo: { faces: [], edges: [] },
    visible: true,
    color: new THREE.Color(0xcccccc),
  };
}

function setup(entries: MeshEntry[] = []) {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const scene = new THREE.Scene();
  const pointer = new THREE.Vector2();
  const context: SceneContext = {
    renderer: () => ({}) as never,
    scene: () => scene,
    camera: () => camera,
    controls: () => ({ target: new THREE.Vector3(), update: () => {} }),
    raycaster: () => new THREE.Raycaster(),
    pointer: () => pointer,
    meshGroup: new THREE.Group(),
    entries,
    ready: () => true,
  };
  entries.forEach((entry) => entry.mesh.updateMatrixWorld());
  const picks: [string, boolean][] = [];
  const picking = useRegionPicking(context);
  picking.show(
    { frame: { plane: "XY" }, regions: [{ key: "L", polygon: square(-10, 0) }, { key: "R", polygon: square(0, 10) }], selected: [] },
    (key, additive) => picks.push([key, additive]),
  );
  return { picking, picks, pointer, scene };
}

describe("useRegionPicking", () => {
  it("picks the region under the cursor and passes Shift through", () => {
    const { picking, picks, pointer } = setup();

    pointer.set(-0.2, 0);
    expect(picking.handleClick(false)).toBe(true);
    pointer.set(0.2, 0);
    expect(picking.handleClick(true)).toBe(true);
    pointer.set(0.9, 0.9);
    expect(picking.handleClick(false)).toBe(false);

    expect(picks).toEqual([["L", false], ["R", true]]);
  });

  it("lets a body in front of the sketch take the click", () => {
    const { picking, pointer } = setup([boxAt(10)]);

    pointer.set(-0.2, 0);
    expect(picking.handleClick(false)).toBe(false);
  });

  it("wins over a body face lying in the sketch plane", () => {
    const { picking, pointer } = setup([boxAt(-5)]);

    pointer.set(-0.2, 0);
    expect(picking.handleClick(false)).toBe(true);
  });

  it("shows one hover fill and removes everything on hide", () => {
    const { picking, pointer, scene } = setup();
    const before = scene.children.length;

    pointer.set(-0.2, 0);
    expect(picking.handleHover()).toBe(true);
    expect(picking.handleHover()).toBe(true);
    expect(scene.children.length).toBe(before + 1);

    picking.hide();
    expect(picking.isActive()).toBe(false);
    expect(scene.children).toHaveLength(0);
  });
});
