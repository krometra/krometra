export type WheelDevice = "mouse" | "trackpad";

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  timeStamp: number;
  wheelDeltaX?: number;
  wheelDeltaY?: number;
}

export type WheelGesture =
  | { kind: "zoom"; delta: number; stepped: boolean }
  | { kind: "pan"; dx: number; dy: number }
  | { kind: "rotate"; dx: number; dy: number };

export type WheelEventLike = Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "ctrlKey" | "shiftKey" | "timeStamp"> & {
  wheelDeltaX?: number;
  wheelDeltaY?: number;
};

export interface WheelOptions {
  trackpadScrollZooms: boolean;
}

const LINE_PX = 16;
const PAGE_PX = 100;
const PINCH_GAIN = 10;
const STREAM_GAP_MS = 150;
const MOUSE_NOTCH_PX = 50;
const LEGACY_TRACKPAD_RATIO = -3;
const ZOOM_BASE = 0.95;
const STEP_ZOOM = 1.1;

export function wheelSample(event: WheelEventLike): WheelSample {
  return {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    timeStamp: event.timeStamp,
    wheelDeltaX: event.wheelDeltaX,
    wheelDeltaY: event.wheelDeltaY,
  };
}

function pixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * LINE_PX;
  if (deltaMode === 2) return delta * PAGE_PX;
  return delta;
}

function dominantAxis(sample: WheelSample): { delta: number; legacy: number | undefined } {
  return Math.abs(sample.deltaX) > Math.abs(sample.deltaY)
    ? { delta: sample.deltaX, legacy: sample.wheelDeltaX }
    : { delta: sample.deltaY, legacy: sample.wheelDeltaY };
}

export function guessWheelDevice(sample: WheelSample): WheelDevice {
  if (sample.deltaMode !== 0) return "mouse";
  if (sample.deltaX !== 0 && !sample.shiftKey) return "trackpad";
  const { delta, legacy } = dominantAxis(sample);
  if (delta === 0) return "trackpad";
  if (legacy) return Math.abs(legacy - LEGACY_TRACKPAD_RATIO * delta) < 1.5 ? "trackpad" : "mouse";
  return Number.isInteger(delta) && Math.abs(delta) >= MOUSE_NOTCH_PX ? "mouse" : "trackpad";
}

export function createWheelClassifier(gapMs = STREAM_GAP_MS): (sample: WheelSample) => WheelDevice {
  let last: { device: WheelDevice; at: number } | null = null;
  return (sample) => {
    const continues = last !== null && sample.timeStamp - last.at >= 0 && sample.timeStamp - last.at < gapMs;
    const device = continues && last ? last.device : guessWheelDevice(sample);
    last = { device, at: sample.timeStamp };
    return device;
  };
}

export function wheelGesture(sample: WheelSample, device: WheelDevice, options: WheelOptions): WheelGesture {
  const dx = pixels(sample.deltaX, sample.deltaMode);
  const dy = pixels(sample.deltaY, sample.deltaMode);
  if (sample.ctrlKey) return { kind: "zoom", delta: dy * PINCH_GAIN, stepped: false };
  if (device === "mouse") return { kind: "zoom", delta: dy || dx, stepped: true };
  if (options.trackpadScrollZooms) return { kind: "zoom", delta: dy, stepped: false };
  if (sample.shiftKey) return { kind: "rotate", dx: -dx, dy: -dy };
  return { kind: "pan", dx: -dx, dy: -dy };
}

export function smoothZoomFactor(delta: number): number {
  return ZOOM_BASE ** (delta * 0.01);
}

export function zoomFactor(gesture: { delta: number; stepped: boolean }): number {
  if (gesture.delta === 0) return 1;
  if (gesture.stepped) return gesture.delta < 0 ? STEP_ZOOM : 1 / STEP_ZOOM;
  return smoothZoomFactor(gesture.delta);
}
