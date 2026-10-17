import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SceneContext, MeshEntry } from "./types";
import type { CameraView } from "./sceneProbe";
import { createGrid, WORLD_UP } from "@/lib/orientation";
import { ISO_VIEW } from "@/composables/useViewCube";
import { coverCrop } from "@/lib/projectThumbnail";
import { isFinitePoint, isUsableCamera, isUsableRadius, viewDirection, type Point3 } from "@/lib/cameraGuard";
import { interpolatePose, type CameraPose } from "@/lib/lookAtView";
import { useSceneLighting } from "./useSceneLighting";

/**
 * Порог в пикселях, ниже которого движение мыши с зажатой кнопкой всё ещё
 * считается кликом, а не вращением сцены. Рука дрожит на пару пикселей даже
 * при обычном клике, поэтому ноль здесь не годится.
 */
const DRAG_SLOP_PX = 5;

/**
 * Отфильтровать `click`, завершившие протяжку камеры.
 *
 * OrbitControls вращает сцену тем же нажатием левой кнопки, которым выбирают
 * грань, и браузер по отпусканию всё равно шлёт `click`. Без этой проверки
 * любое вращение мимо тела снимало выделение — вместе с призраком резьбы,
 * подсветкой грани и выбранными рёбрами.
 */
function guardDragClicks(onClick: (e: MouseEvent) => void): {
  onPointerDown: (e: PointerEvent) => void;
  onClick: (e: MouseEvent) => void;
} {
  let downAt: { x: number; y: number } | null = null;

  return {
    onPointerDown: (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    },
    onClick: (e: MouseEvent) => {
      const start = downAt;
      downAt = null;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_SLOP_PX) return;
      onClick(e);
    },
  };
}

/**
 * Ядро сцены: renderer, камера, свет, контролы, render loop и освобождение
 * ресурсов. Всё, что не относится к выбору, подсветке и превью.
 */
export function useSceneCore(entries: MeshEntry[]) {
  const meshGroup = new THREE.Group();
  const sketchGroup = new THREE.Group();
  const shadedEdgesGroup = new THREE.Group();
  const lighting = useSceneLighting(meshGroup);

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let grid: THREE.GridHelper | null = null;
  let animationId: number | null = null;
  let cameraAnimFrame: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let viewportShown = true;
  let lastGoodView: CameraView | null = null;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const context: SceneContext = {
    renderer: () => renderer!,
    scene: () => scene!,
    camera: () => camera!,
    controls: () => controls!,
    raycaster: () => raycaster,
    pointer: () => pointer,
    meshGroup,
    entries,
    ready: () => renderer !== null && camera !== null,
  };

  function init(
    container: HTMLDivElement,
    handlers: { onClick: (e: MouseEvent) => void; onMove: (e: MouseEvent) => void; onContextMenu: (e: MouseEvent) => void },
  ) {
    const width = container.clientWidth;
    const height = container.clientHeight;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7fa);
    scene.fog = new THREE.Fog(0xf5f7fa, 50, 200);
    scene.add(meshGroup);
    scene.add(sketchGroup);
    scene.add(shadedEdgesGroup);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    applyDefaultView(camera);

    controls = createControls(camera, renderer.domElement, new THREE.Vector3(0, 0, 0));

    grid = createGrid(20, 20);
    scene.add(grid);
    lighting.attach(renderer, scene);

    // Вращение сцены заканчивается обычным `click`, и если курсор при этом
    // стоит мимо тела, выделение сбрасывалось: чуть повернул модель — пропал
    // выбор грани и призрак резьбы вместе с ним. Отличаем клик от протяжки по
    // пройденному расстоянию, а не по факту нажатия.
    const guarded = guardDragClicks(handlers.onClick);
    const guardedMenu = guardDragClicks((e) => {
      if (e.button === 2) handlers.onContextMenu(e);
    });
    renderer.domElement.addEventListener("pointerdown", guarded.onPointerDown);
    renderer.domElement.addEventListener("pointerdown", guardedMenu.onPointerDown);
    renderer.domElement.addEventListener("click", guarded.onClick);
    renderer.domElement.addEventListener("pointerup", guardedMenu.onClick);
    renderer.domElement.addEventListener("mousemove", handlers.onMove);
    cleanupHandlers = {
      onClick: guarded.onClick,
      onMove: handlers.onMove,
      onPointerDown: guarded.onPointerDown,
      onContextMenu: guardedMenu.onClick,
      onMenuPointerDown: guardedMenu.onPointerDown,
    };

    // w/h равны нулю, пока вьюпорт скрыт через v-show: OrbitControls делит
    // протяжку мыши на высоту элемента и копит NaN, поэтому скрытый вьюпорт
    // не принимает ввод
    resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      viewportShown = w > 0 && h > 0;
      if (controls) controls.enabled = viewportShown;
      if (!renderer || !camera || !viewportShown) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    animate();
  }

  let cleanupHandlers: {
    onClick: (e: MouseEvent) => void;
    onMove: (e: MouseEvent) => void;
    onPointerDown: (e: PointerEvent) => void;
    onContextMenu: (e: MouseEvent) => void;
    onMenuPointerDown: (e: PointerEvent) => void;
  } | null = null;

  /** Изометрия Z-up: единая стартовая точка для init() и resetView(). */
  function applyDefaultView(cam: THREE.PerspectiveCamera) {
    cam.up.copy(ISO_VIEW.up);
    cam.position.copy(ISO_VIEW.position);
    cam.lookAt(ISO_VIEW.target);
  }

  function createControls(cam: THREE.PerspectiveCamera, element: HTMLElement, target: THREE.Vector3) {
    const created = new OrbitControls(cam, element);
    created.enableDamping = true;
    created.dampingFactor = 0.08;
    created.zoomToCursor = true;
    created.enabled = viewportShown;
    created.target.copy(target);
    created.update();
    return created;
  }

  function point(vector: THREE.Vector3): Point3 {
    return [vector.x, vector.y, vector.z];
  }

  function currentView(): CameraView | null {
    if (!camera || !controls) return null;
    return { position: point(camera.position), target: point(controls.target), up: point(camera.up) };
  }

  function rebuildControls(view: CameraView) {
    if (!camera || !renderer) return;
    controls?.dispose();
    camera.position.set(...view.position);
    camera.up.set(...view.up);
    controls = createControls(camera, renderer.domElement, new THREE.Vector3(...view.target));
  }

  function guardCamera() {
    const view = currentView();
    if (!view) return;
    if (isUsableCamera(view.position, view.target)) {
      lastGoodView = view;
      return;
    }
    stopCameraAnimation();
    rebuildControls(lastGoodView ?? { position: point(ISO_VIEW.position), target: [0, 0, 0], up: point(ISO_VIEW.up) });
  }

  function animate() {
    animationId = requestAnimationFrame(animate);
    controls?.update();
    guardCamera();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function setHelpersVisible(helpers: { grid?: boolean; sketchOutlines?: boolean }) {
    if (grid && helpers.grid !== undefined) grid.visible = helpers.grid;
    if (helpers.sketchOutlines !== undefined) sketchGroup.visible = helpers.sketchOutlines;
    return { grid: grid?.visible ?? false, sketchOutlines: sketchGroup.visible };
  }

  /** Курсор страницы → NDC вьюпорта. */
  function updatePointer(event: MouseEvent) {
    if (!renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function setCursor(cursor: string) {
    if (renderer) renderer.domElement.style.cursor = cursor;
  }

  function fitCameraToSphere(sphere: THREE.Sphere) {
    if (!camera || !controls || !scene) return;
    if (!isUsableRadius(sphere.radius) || !isFinitePoint(point(sphere.center))) {
      resetView();
      return;
    }

    const distance = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.4;
    const direction = new THREE.Vector3(...viewDirection(point(camera.position), point(controls.target), point(ISO_VIEW.position)));

    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.near = Math.max(distance / 100, 0.01);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.update();

    // Дальность тумана фиксируется при создании сцены (сетка 20 единиц), а
    // дистанция камеры растёт с размером модели: без пересчёта тело крупнее
    // исходного fog.far растворялось в цвете фона и становилось невидимым.
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = distance * 2;
      scene.fog.far = distance * 6;
    }
  }

  function resetView() {
    if (!camera || !controls || !scene) return;
    applyDefaultView(camera);
    camera.near = 0.1;
    camera.far = 1000;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = 50;
      scene.fog.far = 200;
    }
  }

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }

  function stopCameraAnimation() {
    if (cameraAnimFrame === null) return;
    cancelAnimationFrame(cameraAnimFrame);
    cameraAnimFrame = null;
  }

  function setCameraView(view: CameraView) {
    if (!camera || !controls) return;
    stopCameraAnimation();
    rebuildControls(view);
    camera.updateMatrixWorld();
  }

  /** Плавный перелёт камеры в заданный вид (400 мс). */
  function animateCameraTo(viewPos: THREE.Vector3, viewTarget: THREE.Vector3, viewUp: THREE.Vector3) {
    if (!camera || !controls) return;

    stopCameraAnimation();

    const cam = camera;
    const ctrl = controls;
    const start: CameraPose = { position: point(cam.position), target: point(ctrl.target), up: point(cam.up) };
    const end: CameraPose = { position: point(viewPos), target: point(viewTarget), up: point(viewUp) };
    const startTime = performance.now();
    const duration = 400;

    function step() {
      const t = Math.min((performance.now() - startTime) / duration, 1);
      const pose = t < 1 ? interpolatePose(start, end, easeInOutCubic(t)) : end;
      cam.position.set(...pose.position);
      ctrl.target.set(...pose.target);
      cam.up.set(...pose.up);
      ctrl.update();
      cameraAnimFrame = t < 1 ? requestAnimationFrame(step) : null;
    }

    cameraAnimFrame = requestAnimationFrame(step);
  }

  function getCameraState() {
    if (!camera || !controls) {
      return {
        position: { x: 0, y: 0, z: 15 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: WORLD_UP.x, y: WORLD_UP.y, z: WORLD_UP.z },
      };
    }
    return {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
    };
  }

  function captureImage(width: number, height: number): Promise<Blob | null> {
    if (!renderer || !scene || !camera) return Promise.resolve(null);
    const source = renderer.domElement;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context2d = canvas.getContext("2d");
    if (!context2d || source.width === 0 || source.height === 0) return Promise.resolve(null);
    renderer.render(scene, camera);
    const crop = coverCrop(source.width, source.height, width, height);
    context2d.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  function dispose() {
    if (animationId !== null) cancelAnimationFrame(animationId);
    if (cameraAnimFrame !== null) cancelAnimationFrame(cameraAnimFrame);
    resizeObserver?.disconnect();
    lighting.dispose();
    if (renderer) {
      if (cleanupHandlers) {
        renderer.domElement.removeEventListener("click", cleanupHandlers.onClick);
        renderer.domElement.removeEventListener("mousemove", cleanupHandlers.onMove);
        renderer.domElement.removeEventListener("pointerdown", cleanupHandlers.onPointerDown);
        renderer.domElement.removeEventListener("pointerup", cleanupHandlers.onContextMenu);
        renderer.domElement.removeEventListener("pointerdown", cleanupHandlers.onMenuPointerDown);
      }
      renderer.dispose();
    }
    controls?.dispose();
  }

  return {
    context,
    meshGroup,
    sketchGroup,
    shadedEdgesGroup,
    setShadowsAllowed: lighting.setShadowsAllowed,
    init,
    updatePointer,
    setCursor,
    setHelpersVisible,
    fitCameraToSphere,
    resetView,
    setCameraView,
    animateCameraTo,
    stopCameraAnimation,
    orbitControls: () => controls,
    getCameraState,
    captureImage,
    dispose,
  };
}
