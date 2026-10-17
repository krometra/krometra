import { describe, expect, it } from "vitest";
import { fitDistance, framedView } from "./viewFraming";

describe("framedView", () => {
  it("вид спереди смотрит на центр модели вдали от начала координат и вписывает её", () => {
    const view = framedView([0, -15, 0], { center: [-144, 108, 18], radius: 30 }, { target: [0, 0, 0], distance: 15 }, 45);
    expect(view?.target).toEqual([-144, 108, 18]);
    expect(view?.distance).toBeCloseTo(fitDistance(30, 45), 9);
    expect(view?.position[0]).toBeCloseTo(-144, 9);
    expect(view?.position[1]).toBeCloseTo(108 - fitDistance(30, 45), 9);
    expect(view?.position[2]).toBeCloseTo(18, 9);
  });

  it("без тел вид строится вокруг текущей цели на текущем расстоянии", () => {
    const view = framedView([0, 0, 1], null, { target: [5, 6, 7], distance: 40 }, 45);
    expect(view).toEqual({ target: [5, 6, 7], distance: 40, position: [5, 6, 47] });
  });

  it("вырожденная сфера и нулевое направление не ломают камеру", () => {
    expect(framedView([0, -1, 0], { center: [Number.NaN, 0, 0], radius: 3 }, { target: [0, 0, 0], distance: 10 }, 45)?.target).toEqual([0, 0, 0]);
    expect(framedView([0, 0, 0], { center: [0, 0, 0], radius: 3 }, { target: [0, 0, 0], distance: 10 }, 45)).toBeNull();
  });
});
