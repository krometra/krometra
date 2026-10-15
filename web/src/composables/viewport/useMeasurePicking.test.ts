import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MeasureRef } from "@/lib/measure";
import { useMeasurePicking } from "./useMeasurePicking";
import type { MeshEntry, SceneContext } from "./types";

const SIZE = 100;

function edge(edgeId: string, from: number[], to: number[]) {
  return { edge_id: edgeId, vertices: [], polyline: [...from, ...to] };
}

function boxEntry(): MeshEntry {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  return {
    bodyId: "box",
    mesh,
    faceTriangleMap: Array.from({ length: 12 }, (_, triangle) => `f-${Math.floor(triangle / 2)}`),
    brepTopo: {
      faces: [],
      edges: [edge("front-top", [-5, 5, 5], [5, 5, 5]), edge("back-top", [-5, 5, -5], [5, 5, -5])],
    },
    visible: true,
    color: new THREE.Color(0xcccccc),
  };
}

function setup() {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const scene = new THREE.Scene();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const context: SceneContext = {
    renderer: () => ({ domElement: { clientWidth: SIZE, clientHeight: SIZE } }) as never,
    scene: () => scene,
    camera: () => camera,
    controls: () => ({ target: new THREE.Vector3(), update: () => {} }),
    raycaster: () => raycaster,
    pointer: () => pointer,
    meshGroup: new THREE.Group(),
    entries: [boxEntry()],
    ready: () => true,
  };
  const picked: (MeasureRef | null)[] = [];
  const picking = useMeasurePicking({ context, onPicked: (pick) => picked.push(pick) });
  const clickAt = (x: number, y: number) => {
    pointer.set((x / SIZE) * 2 - 1, 1 - (y / SIZE) * 2);
    picking.handleClick();
    return picked[picked.length - 1];
  };
  return { picking, clickAt, scene, context };
}

describe("useMeasurePicking", () => {
  it("у угла берёт вершину, у кромки — ребро, в середине — грань", () => {
    const { clickAt } = setup();
    expect(clickAt(73, 27)).toEqual({ kind: "vertex", bodyId: "box", point: [5, 5, 5] });
    expect(clickAt(50, 28)).toEqual({ kind: "edge", bodyId: "box", edgeId: "front-top" });
    expect(clickAt(50, 50)).toEqual({ kind: "face", bodyId: "box", faceId: "f-4" });
    expect(clickAt(2, 98)).toBeNull();
  });

  it("заслонённое ребро за телом не перехватывает клик у видимой кромки", () => {
    const { clickAt } = setup();
    expect(clickAt(50, 33)).toEqual({ kind: "edge", bodyId: "box", edgeId: "front-top" });
  });

  it("в режиме тел клик берёт тело целиком", () => {
    const { picking, clickAt } = setup();
    picking.setFilter("body");
    expect(clickAt(73, 27)).toEqual({ kind: "body", bodyId: "box" });
  });

  it("выбранные объекты и отрезок-размер рисуются поверх сцены и снимаются вместе с телом", () => {
    const { picking, scene, context } = setup();
    picking.show([{ kind: "face", bodyId: "box", faceId: "f-4" }, { kind: "edge", bodyId: "box", edgeId: "back-top" }], [[0, 0, 5], [0, 5, -5]]);
    const overlay = scene.getObjectByName("measure-overlay")!;
    const drawn = () => overlay.children[0].children.length;
    expect(drawn()).toBe(3);
    picking.forget(context.entries[0]);
    expect(drawn()).toBe(0);
    picking.dispose();
    expect(scene.getObjectByName("measure-overlay")).toBeUndefined();
  });
});
