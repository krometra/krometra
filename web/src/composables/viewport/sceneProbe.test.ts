import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cameraForView, mirrorPreviewSnapshot, projectToClient, threadPreviewSnapshot, visibleSceneBodyIds, type CanvasRect } from "./sceneProbe";

const RECT: CanvasRect = { left: 100, top: 50, width: 800, height: 600 };

function topDownCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, RECT.width / RECT.height, 0.1, 1000);
  camera.up.set(0, 1, 0);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  return camera;
}

function bodyMesh(bodyId: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.userData.bodyId = bodyId;
  return mesh;
}

describe("projectToClient", () => {
  it("центр вида попадает в центр канваса, даже если матрицы камеры ещё не обновлялись", () => {
    const [center] = projectToClient(topDownCamera(), RECT, [[0, 0, 0]]);
    expect(center.x).toBeCloseTo(500, 6);
    expect(center.y).toBeCloseTo(350, 6);
    expect(center).toMatchObject({ behind: false, inside: true });
  });

  it("экранный Y растёт вниз: точка выше по виду получает меньший clientY", () => {
    const [right, up] = projectToClient(topDownCamera(), RECT, [
      [10, 0, 0],
      [0, 10, 0],
    ]);
    expect(right.x).toBeGreaterThan(500);
    expect(right.y).toBeCloseTo(350, 6);
    expect(up.y).toBeLessThan(350);
    expect(up.x).toBeCloseTo(500, 6);
  });

  it("помечает точку за камерой и точку за краем канваса", () => {
    const [behind, outside] = projectToClient(topDownCamera(), RECT, [
      [0, 0, 150],
      [500, 0, 0],
    ]);
    expect(behind).toMatchObject({ behind: true, inside: false });
    expect(outside).toMatchObject({ behind: false, inside: false });
  });
});

describe("cameraForView", () => {
  it("считает гипотетический ракурс, не сдвигая настоящую камеру", () => {
    const camera = topDownCamera();
    camera.updateMatrixWorld();
    const before = camera.matrixWorld.clone();

    const side = cameraForView(camera, { position: [100, 0, 0], target: [0, 0, 0], up: [0, 0, 1] });
    const [top, bottom] = projectToClient(side, RECT, [
      [0, 0, 10],
      [0, 0, -10],
    ]);

    expect(top.y).toBeLessThan(bottom.y);
    expect(top.x).toBeCloseTo(500, 6);
    expect(camera.position.toArray()).toEqual([0, 0, 100]);
    expect(camera.matrixWorld.equals(before)).toBe(true);
    expect(side.fov).toBe(camera.fov);
    expect(side.aspect).toBe(camera.aspect);
  });

  it("сдвиг цели сдвигает проекцию начала координат от центра", () => {
    const side = cameraForView(topDownCamera(), { position: [100, 0, 20], target: [0, 0, 20], up: [0, 0, 1] });
    const [origin] = projectToClient(side, RECT, [[0, 0, 0]]);
    expect(origin.y).toBeGreaterThan(350);
  });
});

describe("visibleSceneBodyIds", () => {
  it("берёт только видимые меши тел, каждое тело один раз", () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const hidden = bodyMesh("hidden");
    hidden.visible = false;
    const edgeLine = new THREE.Line(new THREE.BufferGeometry());
    edgeLine.userData.bodyId = "edges-only";
    group.add(bodyMesh("a"), bodyMesh("a"), hidden, edgeLine, new THREE.Mesh(new THREE.BufferGeometry()));
    scene.add(group, bodyMesh("b"));

    expect(visibleSceneBodyIds(scene)).toEqual(["a", "b"]);
  });

  it("тело, снятое со сцены, не считается", () => {
    const scene = new THREE.Scene();
    const mesh = bodyMesh("a");
    scene.add(mesh);
    scene.remove(mesh);
    expect(visibleSceneBodyIds(scene)).toEqual([]);
  });
});

describe("threadPreviewSnapshot", () => {
  function ribbon(points: number[]): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points), 3));
    return new THREE.Mesh(geometry);
  }

  it("без призрака возвращает null", () => {
    const scene = new THREE.Scene();
    scene.add(bodyMesh("a"));
    expect(threadPreviewSnapshot(scene)).toBeNull();
  });

  it("отдаёт параметры призрака, число заходов и общий габарит витков", () => {
    const scene = new THREE.Scene();
    const ghost = new THREE.Group();
    ghost.userData.threadPreview = { starts: 2, pitch: 6, depth: 1.5, external: true };
    ghost.add(ribbon([0, 0, 0, 5, 1, 2]), ribbon([-5, -1, 4, 1, 1, 9]));
    scene.add(bodyMesh("a"), ghost);

    expect(threadPreviewSnapshot(scene)).toEqual({
      starts: 2,
      pitch: 6,
      depth: 1.5,
      external: true,
      threads: 2,
      bbox: { min: [-5, -1, 0], max: [5, 1, 9] },
    });
  });
});

describe("mirrorPreviewSnapshot", () => {
  it("без призрака зеркала возвращает null, с ним — исходное тело и габарит", () => {
    const scene = new THREE.Scene();
    scene.add(bodyMesh("a"));
    expect(mirrorPreviewSnapshot(scene)).toBeNull();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-10, 0, 0, 0, 4, 2]), 3));
    const ghost = new THREE.Mesh(geometry);
    ghost.userData.mirrorPreview = { sourceBodyId: "a" };
    scene.add(ghost);

    expect(mirrorPreviewSnapshot(scene)).toEqual({ sourceBodyId: "a", bbox: { min: [-10, 0, 0], max: [0, 4, 2] } });
    expect(visibleSceneBodyIds(scene)).toEqual(["a"]);
  });
});
