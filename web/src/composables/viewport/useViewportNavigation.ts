import { MOUSE } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mouseDragAction, orbitButtonFor, type OrbitButton } from "@/lib/navigation/navigationPresets";
import { createWheelClassifier, wheelGesture, wheelSample, type WheelGesture } from "@/lib/navigation/wheelGesture";
import type { NavigationSettings } from "@/lib/navigation/navigationSettings";

interface OrbitInternals {
  _rotateLeft(angle: number): void;
  _rotateUp(angle: number): void;
  _pan(deltaX: number, deltaY: number): void;
  _handleMouseWheel(event: { clientX: number; clientY: number; deltaY: number }): void;
}

const ORBIT_MOUSE: Record<OrbitButton, MOUSE | null> = {
  ROTATE: MOUSE.ROTATE,
  PAN: MOUSE.PAN,
  DOLLY: MOUSE.DOLLY,
  NONE: null,
};

const BUTTON_KEYS: Record<number, "LEFT" | "MIDDLE" | "RIGHT"> = { 0: "LEFT", 1: "MIDDLE", 2: "RIGHT" };
const MIDDLE_BUTTON = 1;

export function useViewportNavigation(deps: {
  controls: () => OrbitControls | null;
  settings: () => NavigationSettings;
  beforeMove: () => void;
}) {
  const classify = createWheelClassifier();
  let container: HTMLElement | null = null;

  function activeControls(): OrbitControls | null {
    const controls = deps.controls();
    return controls?.enabled ? controls : null;
  }

  function internals(controls: OrbitControls): OrbitInternals {
    return controls as unknown as OrbitInternals;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    const key = BUTTON_KEYS[event.button];
    const controls = activeControls();
    if (!key || !controls) return;
    const action = mouseDragAction(deps.settings().preset, event);
    controls.mouseButtons = { ...controls.mouseButtons, [key]: ORBIT_MOUSE[orbitButtonFor(action, event)] };
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button === MIDDLE_BUTTON) event.preventDefault();
  }

  function apply(controls: OrbitControls, gesture: WheelGesture, event: WheelEvent) {
    const orbit = internals(controls);
    if (gesture.kind === "zoom") {
      orbit._handleMouseWheel({ clientX: event.clientX, clientY: event.clientY, deltaY: gesture.delta });
      return;
    }
    if (gesture.kind === "pan") {
      orbit._pan(gesture.dx, gesture.dy);
      return;
    }
    const height = controls.domElement?.clientHeight ?? 0;
    if (height <= 0) return;
    orbit._rotateLeft((2 * Math.PI * gesture.dx) / height);
    orbit._rotateUp((2 * Math.PI * gesture.dy) / height);
  }

  function onWheel(event: WheelEvent) {
    const controls = activeControls();
    if (!controls) return;
    event.preventDefault();
    event.stopPropagation();
    const sample = wheelSample(event);
    const gesture = wheelGesture(sample, classify(sample), deps.settings());
    deps.beforeMove();
    apply(controls, gesture, event);
  }

  function orbitBy(azimuth: number, elevation: number) {
    const controls = activeControls();
    if (!controls) return;
    deps.beforeMove();
    internals(controls)._rotateLeft(azimuth);
    internals(controls)._rotateUp(elevation);
  }

  function attach(element: HTMLElement) {
    container = element;
    element.addEventListener("pointerdown", onPointerDown, { capture: true });
    element.addEventListener("mousedown", onMouseDown, { capture: true });
    element.addEventListener("wheel", onWheel, { capture: true, passive: false });
  }

  function detach() {
    if (!container) return;
    container.removeEventListener("pointerdown", onPointerDown, { capture: true });
    container.removeEventListener("mousedown", onMouseDown, { capture: true });
    container.removeEventListener("wheel", onWheel, { capture: true });
    container = null;
  }

  return { attach, detach, orbitBy };
}
