import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { useSectionView } from "./useSectionView";
import type { MeshEntry, SceneContext } from "./types";

function makeEntry(bodyId: string, offsetZ = 0): MeshEntry {
  const geometry = new THREE.BoxGeometry(10, 10, 10).translate(0, 0, offsetZ);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  return { bodyId, mesh, faceTriangleMap: [], brepTopo: { faces: [], edges: [] }, visible: true, color: new THREE.Color() };
}

function setup(entries: MeshEntry[]) {
  const renderer = { clippingPlanes: [] as THREE.Plane[] };
  const scene = new THREE.Scene();
  const context = {
    renderer: () => renderer,
    scene: () => scene,
    entries,
  } as unknown as SceneContext;
  return { renderer, scene, section: useSectionView(context) };
}

const helpers = (entry: MeshEntry) => entry.mesh.children.filter((child) => child.userData.sectionStencil);
const cap = (scene: THREE.Scene) => scene.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh | undefined;

describe("useSectionView", () => {
  it("включает глобальную плоскость отсечения и заглушку среза в плоскости", () => {
    const entry = makeEntry("body-1");
    const { renderer, scene, section } = setup([entry]);

    section.apply({ normal: [0, 0, -1], constant: 2 });

    expect(renderer.clippingPlanes).toHaveLength(1);
    expect(renderer.clippingPlanes[0].distanceToPoint(new THREE.Vector3(0, 0, 1))).toBeCloseTo(1);
    expect(helpers(entry)).toHaveLength(2);
    const plate = cap(scene)!;
    expect(plate.position.z).toBeCloseTo(2, 3);
    expect(renderer.clippingPlanes[0].distanceToPoint(plate.position)).toBeGreaterThan(0);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(plate.quaternion).z).toBeCloseTo(-1);
    expect(section.snapshot()).toEqual({ normal: [0, 0, -1], constant: 2 });
  });

  it("повторное применение двигает плоскость, не плодя стенсил-копий", () => {
    const entry = makeEntry("body-1");
    const { scene, section } = setup([entry]);

    section.apply({ normal: [0, 0, -1], constant: 2 });
    section.apply({ normal: [0, 0, 1], constant: 3 });

    expect(helpers(entry)).toHaveLength(2);
    expect(scene.children.filter((child) => child instanceof THREE.Mesh)).toHaveLength(1);
    expect(cap(scene)!.position.z).toBeCloseTo(-3, 3);
  });

  it("стенсил-копии не ловят луч и рисуются между телом и заглушкой", () => {
    const entry = makeEntry("body-1");
    const { scene, section } = setup([entry]);
    section.apply({ normal: [0, 0, -1], constant: 0 });

    const raycaster = new THREE.Raycaster(new THREE.Vector3(1, 2, 50), new THREE.Vector3(0, 0, -1));
    expect(raycaster.intersectObjects(helpers(entry), false)).toEqual([]);
    expect(raycaster.intersectObject(cap(scene)!, false)).toEqual([]);
    expect(helpers(entry).every((helper) => (helper as THREE.Mesh).renderOrder === 1)).toBe(true);
    expect(cap(scene)!.renderOrder).toBe(2);
  });

  it("новое тело во время сечения тоже получает стенсил", () => {
    const entries = [makeEntry("body-1")];
    const { section } = setup(entries);
    section.apply({ normal: [0, 0, -1], constant: 0 });

    const added = makeEntry("body-2", 30);
    entries.push(added);
    section.adopt(added);

    expect(helpers(added)).toHaveLength(2);
  });

  it("выключение снимает отсечение, копии и заглушку", () => {
    const entry = makeEntry("body-1");
    const { renderer, scene, section } = setup([entry]);
    section.apply({ normal: [0, 0, -1], constant: 0 });

    section.clear();

    expect(renderer.clippingPlanes).toEqual([]);
    expect(helpers(entry)).toEqual([]);
    expect(cap(scene)).toBeUndefined();
    expect(section.snapshot()).toBeNull();
  });

  it("снимок для превью рисуется без отсечения, после него сечение на месте", () => {
    const { renderer, section } = setup([makeEntry("body-1")]);
    section.apply({ normal: [0, 0, -1], constant: 0 });

    const during = section.unclipped(() => renderer.clippingPlanes.length);

    expect(during).toBe(0);
    expect(renderer.clippingPlanes).toHaveLength(1);
  });

  it("без сечения новое тело остаётся без копий", () => {
    const entry = makeEntry("body-1");
    const { section } = setup([]);
    section.adopt(entry);
    expect(helpers(entry)).toEqual([]);
  });
});
