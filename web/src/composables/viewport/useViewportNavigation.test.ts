import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useViewportNavigation } from "./useViewportNavigation";
import type { NavigationSettings } from "@/lib/navigation/navigationSettings";

const WIDTH = 800;
const HEIGHT = 600;

class FakeCanvas extends EventTarget {
  style: Record<string, string> = {};
  clientWidth = WIDTH;
  clientHeight = HEIGHT;
  getRootNode() {
    return new EventTarget();
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: WIDTH, height: HEIGHT };
  }
  setPointerCapture() {}
  releasePointerCapture() {}
}

function domEvent<T extends object>(type: string, fields: T): Event & T {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  return event as Event & T;
}

function wheel(fields: Partial<WheelEvent>) {
  return domEvent("wheel", {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    shiftKey: false,
    clientX: WIDTH / 2,
    clientY: HEIGHT / 2,
    timeStamp: 0,
    ...fields,
  });
}

function setup(settings: NavigationSettings = { preset: "krometra", trackpadScrollZooms: false }) {
  const canvas = new FakeCanvas();
  const container = new EventTarget();
  const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(60, -60, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const controls = new OrbitControls(camera, canvas as unknown as HTMLElement);
  controls.zoomToCursor = true;
  let moves = 0;
  const navigation = useViewportNavigation({ controls: () => controls, settings: () => settings, beforeMove: () => moves++ });
  navigation.attach(container as unknown as HTMLElement);
  const settle = () => {
    controls.update();
    camera.updateMatrixWorld();
  };
  const distance = () => camera.position.distanceTo(controls.target);
  return { container, camera, controls, navigation, settle, distance, moves: () => moves, settings };
}

describe("useViewportNavigation", () => {
  it("нажатие кнопки настраивает OrbitControls под выбранный пресет", () => {
    const { container, controls, settings } = setup({ preset: "solidworks", trackpadScrollZooms: false });
    container.dispatchEvent(domEvent("pointerdown", { pointerType: "mouse", button: 1, shiftKey: false, ctrlKey: false, metaKey: false }));
    expect(controls.mouseButtons.MIDDLE).toBe(THREE.MOUSE.ROTATE);
    container.dispatchEvent(domEvent("pointerdown", { pointerType: "mouse", button: 1, shiftKey: false, ctrlKey: true, metaKey: false }));
    expect(controls.mouseButtons.MIDDLE).toBe(THREE.MOUSE.ROTATE);
    container.dispatchEvent(domEvent("pointerdown", { pointerType: "mouse", button: 0, shiftKey: false, ctrlKey: false, metaKey: false }));
    expect(controls.mouseButtons.LEFT).toBeNull();
    settings.preset = "krometra";
    container.dispatchEvent(domEvent("pointerdown", { pointerType: "mouse", button: 0, shiftKey: false, ctrlKey: false, metaKey: false }));
    expect(controls.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
  });

  it("средняя кнопка не запускает автопрокрутку браузера", () => {
    const { container } = setup();
    const event = domEvent("mousedown", { button: 1 });
    container.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("колесо мыши приближает к точке под курсором: камера и цель смещаются к курсору", () => {
    const { container, camera, controls, settle, distance } = setup();
    const before = distance();
    const targetBefore = controls.target.clone();
    const event = wheel({ deltaY: -240, clientX: WIDTH * 0.85, clientY: HEIGHT / 2 });
    container.dispatchEvent(event);
    settle();
    expect(event.defaultPrevented).toBe(true);
    expect(distance()).toBeLessThan(before);
    expect(controls.target.distanceTo(targetBefore)).toBeGreaterThan(0.1);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
  });

  it("щипок трекпада зумит, двухпальцевый скролл панорамирует без смены дистанции", () => {
    const { container, controls, settle, distance } = setup();
    const before = distance();
    container.dispatchEvent(wheel({ deltaY: -3, ctrlKey: true }));
    settle();
    const zoomed = distance();
    expect(zoomed).toBeLessThan(before);

    const targetBefore = controls.target.clone();
    container.dispatchEvent(wheel({ deltaX: 12, deltaY: 8, timeStamp: 1000 }));
    settle();
    expect(controls.target.distanceTo(targetBefore)).toBeGreaterThan(0.1);
    expect(distance()).toBeCloseTo(zoomed, 6);
  });

  it("Shift и два пальца вращают вокруг цели, горизонт остаётся горизонтальным", () => {
    const { container, camera, controls, settle, distance } = setup();
    const before = distance();
    const position = camera.position.clone();
    container.dispatchEvent(wheel({ deltaX: 30, deltaY: 0, shiftKey: true, wheelDeltaX: -90 } as Partial<WheelEvent>));
    settle();
    expect(camera.position.distanceTo(position)).toBeGreaterThan(0.1);
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
    expect(distance()).toBeCloseTo(before, 6);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    expect(right.z).toBeCloseTo(0, 6);
  });

  it("опция «скролл = зум» возвращает трекпаду зум", () => {
    const { container, settle, distance } = setup({ preset: "krometra", trackpadScrollZooms: true });
    const before = distance();
    container.dispatchEvent(wheel({ deltaX: 2, deltaY: -20 }));
    settle();
    expect(distance()).toBeLessThan(before);
  });

  it("orbitBy вращает камеру вокруг текущей цели и останавливает перелёт камеры", () => {
    const { navigation, camera, controls, settle, distance, moves } = setup();
    controls.target.set(5, 5, 0);
    settle();
    const before = distance();
    const position = camera.position.clone();
    navigation.orbitBy(0.3, 0.1);
    settle();
    expect(moves()).toBe(1);
    expect(camera.position.distanceTo(position)).toBeGreaterThan(0.1);
    expect(controls.target.toArray()).toEqual([5, 5, 0]);
    expect(distance()).toBeCloseTo(before, 6);
  });

  it("выключенные контролы (скрытый вьюпорт) событий не принимают", () => {
    const { container, controls, camera, navigation, moves } = setup();
    controls.enabled = false;
    const position = camera.position.clone();
    const event = wheel({ deltaY: -240 });
    container.dispatchEvent(event);
    navigation.orbitBy(1, 1);
    controls.update();
    expect(event.defaultPrevented).toBe(false);
    expect(moves()).toBe(0);
    expect(camera.position.distanceTo(position)).toBeCloseTo(0, 9);
  });

  it("detach снимает обработчики", () => {
    const { container, navigation, moves } = setup();
    navigation.detach();
    container.dispatchEvent(wheel({ deltaY: -240 }));
    expect(moves()).toBe(0);
  });
});
