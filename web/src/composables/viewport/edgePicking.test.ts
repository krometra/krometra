import { describe, it, expect } from "vitest";
import { bestEdgeHit, edgePickThreshold, EDGE_PICK_TIE_PX } from "./edgePicking";

const hit = (id: string, px: number, distance: number) => ({ hit: id, px, distance });

describe("bestEdgeHit", () => {
  it("нет попаданий — нет победителя", () => {
    expect(bestEdgeHit([])).toBeNull();
  });

  it("выигрывает ближайшее к курсору на экране, а не вдоль луча", () => {
    const far = hit("far-on-screen", 10, 1);
    const near = hit("near-on-screen", 2, 50);
    expect(bestEdgeHit([far, near])?.hit).toBe("near-on-screen");
  });

  it("ничью в пределах допуска разрешает глубина", () => {
    const shallow = hit("shallow", 3, 5);
    const deep = hit("deep", 3 + EDGE_PICK_TIE_PX, 1);
    expect(bestEdgeHit([shallow, deep])?.hit).toBe("deep");
  });

  it("за пределами допуска глубина не спасает", () => {
    const front = hit("front", 3 + EDGE_PICK_TIE_PX + 1, 1);
    const nearest = hit("nearest", 3, 100);
    expect(bestEdgeHit([front, nearest])?.hit).toBe("nearest");
  });
});

describe("edgePickThreshold", () => {
  it("растёт с дистанцией камеры", () => {
    const near = edgePickThreshold(45, 10, 1000);
    const far = edgePickThreshold(45, 100, 1000);
    expect(far).toBeGreaterThan(near);
  });

  it("порог одинаков в пикселях при разной высоте окна", () => {
    // Раньше порог был долей мировой дистанции и «плавал» с высотой окна.
    const tall = edgePickThreshold(45, 50, 2000);
    const short = edgePickThreshold(45, 50, 500);
    expect(tall * 4).toBeCloseTo(short, 6);
  });

  it("никогда не вырождается в ноль", () => {
    expect(edgePickThreshold(45, 0, 1000)).toBeGreaterThan(0);
  });
});
