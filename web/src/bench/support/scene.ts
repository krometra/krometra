import * as THREE from "three";
import type { MeshEntry, RenderingMode, SceneContext } from "@/composables/viewport/types";
import { useBodyRegistry } from "@/composables/viewport/useBodyRegistry";

const VIEW = { width: 1600, height: 900 };
const CURSOR_STEPS = 32;
const CURSOR_REACH = 0.45;
const CAMERA_OFFSET = 0.75;

export function benchScene(size: { width: number; height: number }, renderingMode: RenderingMode = "shaded") {
  const entries: MeshEntry[] = [];
  const meshGroup = new THREE.Group();
  const target = new THREE.Vector3(size.width / 2, size.height / 2, 0);
  const camera = new THREE.PerspectiveCamera(45, VIEW.width / VIEW.height, 0.1, 100000);
  camera.up.set(0, 0, 1);
  const reach = Math.max(size.width, size.height) * CAMERA_OFFSET;
  camera.position.set(target.x, target.y - reach, reach);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const scene = new THREE.Scene();
  const renderer = { domElement: { clientWidth: VIEW.width, clientHeight: VIEW.height } } as unknown as THREE.WebGLRenderer;
  const controls = { target, update: () => undefined };
  const context: SceneContext = {
    renderer: () => renderer,
    scene: () => scene,
    camera: () => camera,
    controls: () => controls,
    raycaster: () => raycaster,
    pointer: () => pointer,
    meshGroup,
    entries,
    ready: () => true,
  };
  const registry = useBodyRegistry({
    entries,
    meshGroup,
    shadedEdgesGroup: new THREE.Group(),
    renderingMode: () => renderingMode,
    onMeshRemoved: () => undefined,
    onMeshAdded: () => undefined,
    fitCameraToSphere: () => undefined,
  });
  let step = 0;
  const moveCursor = () => {
    const phase = (2 * Math.PI * (step++ % CURSOR_STEPS)) / CURSOR_STEPS;
    pointer.set(CURSOR_REACH * Math.cos(phase), CURSOR_REACH * Math.sin(2 * phase));
  };
  return { context, registry, moveCursor };
}
