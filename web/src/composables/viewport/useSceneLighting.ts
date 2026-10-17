import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Vec3 } from "@/lib/threadGeometry";
import {
  fillLightDirection,
  floorShadowVisible,
  keyLightDirection,
  sameBounds,
  sameDirection,
  shadowRig,
  type Bounds3,
  type ShadowRig,
} from "@/lib/sceneLighting";

const SHADOW_MAP_SIZE = 2048;
const SHADOW_BIAS = -0.0004;
const SHADOW_RADIUS = 3;
const KEY_INTENSITY = 2.8;
const FILL_INTENSITY = 0.25;
const AMBIENT_INTENSITY = 0.35;
const HEMISPHERE_INTENSITY = 0.6;
const ENVIRONMENT_INTENSITY = 0.12;
const FLOOR_SHADOW_OPACITY = 0.16;
const ORIGIN: Vec3 = [0, 0, 0];

function vec(vector: THREE.Vector3): Vec3 {
  return [vector.x, vector.y, vector.z];
}

function shownMeshes(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && child.visible);
}

function meshBounds(meshes: THREE.Mesh[]): Bounds3 | null {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) continue;
    box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
  }
  return box.isEmpty() ? null : { min: vec(box.min), max: vec(box.max) };
}

function meshesKey(meshes: THREE.Mesh[]): string {
  return meshes.map((mesh) => `${mesh.uuid}:${mesh.geometry.uuid}`).join("|");
}

function noRaycast() {}

export function useSceneLighting(meshGroup: THREE.Group) {
  const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
  const hemisphere = new THREE.HemisphereLight(0xeef4ff, 0xd8d2c6, HEMISPHERE_INTENSITY);
  hemisphere.position.set(0, 0, 1);
  const key = new THREE.DirectionalLight(0xffffff, KEY_INTENSITY);
  key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  key.shadow.bias = SHADOW_BIAS;
  key.shadow.radius = SHADOW_RADIUS;
  const fill = new THREE.DirectionalLight(0xdfe8ff, FILL_INTENSITY);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({ color: 0x1b2433, opacity: FLOOR_SHADOW_OPACITY, depthWrite: false }),
  );
  floor.receiveShadow = true;
  floor.raycast = noRaycast;
  floor.visible = false;

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let environment: THREE.Texture | null = null;
  let shadowsAllowed = true;
  let shadowState: { direction: Vec3; bounds: Bounds3; meshes: string } | null = null;

  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();

  function attach(target: THREE.WebGLRenderer, targetScene: THREE.Scene) {
    renderer = target;
    scene = targetScene;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    scene.add(ambient, hemisphere, key, key.target, fill, fill.target, floor);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    scene.environment = environment;
    scene.environmentIntensity = ENVIRONMENT_INTENSITY;
    scene.environmentRotation.set(Math.PI / 2, 0, 0);
    scene.onBeforeRender = (_renderer, _scene, camera) => update(camera);
  }

  function place(light: THREE.DirectionalLight, position: Vec3, target: Vec3) {
    light.position.set(...position);
    light.target.position.set(...target);
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
  }

  function setShadowCasting(enabled: boolean) {
    if (key.castShadow === enabled) return;
    key.castShadow = enabled;
    shadowState = null;
  }

  function shadowUpToDate(direction: Vec3, bounds: Bounds3, meshes: string): boolean {
    const previous = shadowState;
    return previous !== null && previous.meshes === meshes && sameBounds(previous.bounds, bounds) && sameDirection(previous.direction, direction);
  }

  function fitShadowCamera(rig: ShadowRig) {
    const shadowCamera = key.shadow.camera;
    shadowCamera.left = -rig.halfExtent;
    shadowCamera.right = rig.halfExtent;
    shadowCamera.top = rig.halfExtent;
    shadowCamera.bottom = -rig.halfExtent;
    shadowCamera.near = rig.near;
    shadowCamera.far = rig.far;
    shadowCamera.updateProjectionMatrix();
    key.shadow.normalBias = rig.normalBias;
  }

  function placeFloor(rig: ShadowRig, direction: Vec3) {
    floor.position.set(rig.floor.center[0], rig.floor.center[1], rig.floor.z);
    floor.scale.set(rig.floor.size, rig.floor.size, 1);
    floor.visible = key.castShadow && floorShadowVisible(direction, cameraPosition.z, rig.floor.z);
  }

  function update(camera: THREE.Camera) {
    camera.getWorldDirection(forward);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    camera.getWorldPosition(cameraPosition);
    const keyDirection = keyLightDirection(vec(forward), vec(up));
    place(fill, fillLightDirection(vec(forward), vec(up)), ORIGIN);
    const meshes = shownMeshes(meshGroup);
    const bounds = meshBounds(meshes);
    setShadowCasting(shadowsAllowed && bounds !== null && renderer !== null && renderer.clippingPlanes.length === 0);
    if (!bounds) {
      place(key, keyDirection, ORIGIN);
      floor.visible = false;
      return;
    }

    const rig = shadowRig(bounds, keyDirection, SHADOW_MAP_SIZE);
    place(key, rig.position, rig.target);
    placeFloor(rig, keyDirection);
    const meshSignature = meshesKey(meshes);
    if (!key.castShadow || shadowUpToDate(keyDirection, bounds, meshSignature)) return;
    fitShadowCamera(rig);
    shadowState = { direction: keyDirection, bounds, meshes: meshSignature };
    if (renderer) renderer.shadowMap.needsUpdate = true;
  }

  function setShadowsAllowed(allowed: boolean) {
    shadowsAllowed = allowed;
  }

  function dispose() {
    if (scene) {
      scene.onBeforeRender = () => {};
      scene.environment = null;
      scene.remove(ambient, hemisphere, key, key.target, fill, fill.target, floor);
    }
    environment?.dispose();
    key.shadow.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
    renderer = null;
    scene = null;
  }

  return { attach, setShadowsAllowed, dispose };
}
