import { describe, expect, it } from "vitest";
import {
  createWheelClassifier,
  guessWheelDevice,
  smoothZoomFactor,
  wheelGesture,
  zoomFactor,
  type WheelSample,
} from "./wheelGesture";

function wheel(sample: Partial<WheelSample>): WheelSample {
  return { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false, timeStamp: 0, ...sample };
}

const OFF = { trackpadScrollZooms: false };
const ON = { trackpadScrollZooms: true };

describe("мышь или трекпад", () => {
  it("строчный и страничный режимы бывают только у колеса мыши", () => {
    expect(guessWheelDevice(wheel({ deltaY: 3, deltaMode: 1 }))).toBe("mouse");
    expect(guessWheelDevice(wheel({ deltaY: 1, deltaMode: 2 }))).toBe("mouse");
  });

  it("горизонтальная составляющая без Shift - трекпад", () => {
    expect(guessWheelDevice(wheel({ deltaX: 3, deltaY: 1 }))).toBe("trackpad");
  });

  it("Chrome и Safari: у трекпада wheelDelta ровно в -3 раза больше delta, у мыши - кратна 120", () => {
    expect(guessWheelDevice(wheel({ deltaY: 4.000244140625, wheelDeltaY: -120 }))).toBe("mouse");
    expect(guessWheelDevice(wheel({ deltaY: 100, wheelDeltaY: -120 }))).toBe("mouse");
    expect(guessWheelDevice(wheel({ deltaY: -240, wheelDeltaY: 120 }))).toBe("mouse");
    expect(guessWheelDevice(wheel({ deltaY: 2, wheelDeltaY: -6 }))).toBe("trackpad");
    expect(guessWheelDevice(wheel({ deltaY: 40, wheelDeltaY: -120 }))).toBe("trackpad");
  });

  it("Shift с колесом мыши на macOS даёт горизонтальную прокрутку, но это всё ещё мышь", () => {
    expect(guessWheelDevice(wheel({ deltaX: 4.000244140625, wheelDeltaX: -120, shiftKey: true }))).toBe("mouse");
    expect(guessWheelDevice(wheel({ deltaX: 3, wheelDeltaX: -9, shiftKey: true }))).toBe("trackpad");
  });

  it("без wheelDelta: крупный целый шаг - мышь, мелкий или дробный - трекпад", () => {
    expect(guessWheelDevice(wheel({ deltaY: 100 }))).toBe("mouse");
    expect(guessWheelDevice(wheel({ deltaY: 3 }))).toBe("trackpad");
    expect(guessWheelDevice(wheel({ deltaY: 57.5 }))).toBe("trackpad");
  });

  it("частые события одного жеста не меняют устройство посреди жеста", () => {
    const classify = createWheelClassifier(150);
    expect(classify(wheel({ deltaY: 2, wheelDeltaY: -6, timeStamp: 0 }))).toBe("trackpad");
    expect(classify(wheel({ deltaY: 120, timeStamp: 16 }))).toBe("trackpad");
    expect(classify(wheel({ deltaY: 100, wheelDeltaY: -120, timeStamp: 40 }))).toBe("trackpad");
  });

  it("после паузы устройство определяется заново", () => {
    const classify = createWheelClassifier(150);
    expect(classify(wheel({ deltaY: 2, wheelDeltaY: -6, timeStamp: 0 }))).toBe("trackpad");
    expect(classify(wheel({ deltaY: 100, wheelDeltaY: -120, timeStamp: 400 }))).toBe("mouse");
  });
});

describe("жест колеса в действие камеры", () => {
  it("колесо мыши - ступенчатый зум, строки переводятся в пиксели", () => {
    expect(wheelGesture(wheel({ deltaY: -3, deltaMode: 1 }), "mouse", OFF)).toEqual({ kind: "zoom", delta: -48, stepped: true });
    expect(wheelGesture(wheel({ deltaY: 100 }), "mouse", ON)).toEqual({ kind: "zoom", delta: 100, stepped: true });
  });

  it("щипок (wheel с ctrlKey) - плавный зум с усилением, как в OrbitControls", () => {
    expect(wheelGesture(wheel({ deltaY: -2, ctrlKey: true }), "trackpad", OFF)).toEqual({ kind: "zoom", delta: -20, stepped: false });
  });

  it("два пальца - панорама вслед за пальцами", () => {
    expect(wheelGesture(wheel({ deltaX: 5, deltaY: -3 }), "trackpad", OFF)).toEqual({ kind: "pan", dx: -5, dy: 3 });
  });

  it("Shift и два пальца - вращение", () => {
    expect(wheelGesture(wheel({ deltaX: 5, deltaY: -3, shiftKey: true }), "trackpad", OFF)).toEqual({ kind: "rotate", dx: -5, dy: 3 });
  });

  it("опция «скролл = зум» возвращает трекпаду старое поведение, щипок по-прежнему зумит", () => {
    expect(wheelGesture(wheel({ deltaY: 7 }), "trackpad", ON)).toEqual({ kind: "zoom", delta: 7, stepped: false });
    expect(wheelGesture(wheel({ deltaY: 7, shiftKey: true }), "trackpad", ON)).toEqual({ kind: "zoom", delta: 7, stepped: false });
  });
});

describe("коэффициент зума", () => {
  it("прокрутка от себя приближает, на себя отдаляет", () => {
    expect(zoomFactor({ delta: -100, stepped: true })).toBeCloseTo(1.1, 9);
    expect(zoomFactor({ delta: 100, stepped: true })).toBeCloseTo(1 / 1.1, 9);
    expect(zoomFactor({ delta: -20, stepped: false })).toBeGreaterThan(1);
    expect(zoomFactor({ delta: 20, stepped: false })).toBeLessThan(1);
    expect(zoomFactor({ delta: 0, stepped: true })).toBe(1);
  });

  it("плавный зум симметричен: туда и обратно - на месте", () => {
    expect(smoothZoomFactor(37) * smoothZoomFactor(-37)).toBeCloseTo(1, 12);
  });
});
