import { describe, expect, it } from "vitest";
import { boxCorners, browserExtrudeSpan, flatPoints, projectOntoNormal, type BrowserExtrudeExtent } from "./browserExtrudeExtent";

const extent = (patch: Partial<BrowserExtrudeExtent>): BrowserExtrudeExtent => ({
  extentType: "distance",
  direction: "one_side",
  distance: 10,
  backDistance: 0,
  offset: 0,
  operation: "new_body",
  ...patch,
});

describe("browserExtrudeSpan: на расстояние", () => {
  it("идёт по нормали или против неё по знаку расстояния", () => {
    expect(browserExtrudeSpan(extent({ distance: 10 }), null)).toEqual({ start: 0, end: 10 });
    expect(browserExtrudeSpan(extent({ distance: -4 }), null)).toEqual({ start: -4, end: 0 });
  });

  it("делит расстояние пополам при симметрии", () => {
    expect(browserExtrudeSpan(extent({ direction: "symmetric", distance: -10 }), null)).toEqual({ start: -5, end: 5 });
  });

  it("добавляет обратное расстояние в обе стороны", () => {
    expect(browserExtrudeSpan(extent({ direction: "two_sided", distance: 10, backDistance: 3 }), null)).toEqual({ start: -3, end: 10 });
    expect(browserExtrudeSpan(extent({ direction: "two_sided", distance: -10, backDistance: 3 }), null)).toEqual({ start: -10, end: 3 });
  });

  it("требует обратное расстояние для двух сторон", () => {
    expect(() => browserExtrudeSpan(extent({ direction: "two_sided", backDistance: 0 }), null)).toThrow("обратное расстояние");
  });

  it("отклоняет нулевое расстояние", () => {
    expect(() => browserExtrudeSpan(extent({ distance: 0 }), null)).toThrow("нулевым");
  });
});

describe("browserExtrudeSpan: насквозь", () => {
  const cut = { extentType: "through_all" as const, operation: "cut" as const };

  it("проходит тело целиком с запасом против нормали", () => {
    expect(browserExtrudeSpan(extent({ ...cut, distance: -1 }), [0, -20, -5])).toEqual({ start: -21, end: 0 });
  });

  it("требует тело по направлению выдавливания", () => {
    expect(() => browserExtrudeSpan(extent({ ...cut, distance: 1 }), [0, -20])).toThrow("Реверс");
  });

  it("симметрично перекрывает дальнюю сторону", () => {
    expect(browserExtrudeSpan(extent({ ...cut, direction: "symmetric" }), [-3, 8])).toEqual({ start: -9, end: 9 });
  });

  it("в две стороны проходит каждую сторону отдельно", () => {
    expect(browserExtrudeSpan(extent({ ...cut, direction: "two_sided", backDistance: 1 }), [-3, 8])).toEqual({ start: -4, end: 9 });
  });

  it("недоступно для нового тела", () => {
    expect(() => browserExtrudeSpan(extent({ extentType: "through_all" }), [5])).toThrow("приклеивания и выреза");
  });
});

describe("browserExtrudeSpan: до грани", () => {
  const upToFace = { extentType: "up_to_face" as const };

  it("доходит до дальней вершины грани, сторону задаёт геометрия", () => {
    expect(browserExtrudeSpan(extent({ ...upToFace, distance: -5 }), [4, 6])).toEqual({ start: 0, end: 6 });
    expect(browserExtrudeSpan(extent({ ...upToFace }), [-4, -7])).toEqual({ start: -7, end: 0 });
  });

  it("прорезает грань с запасом 0.1 мм при вырезе", () => {
    const span = browserExtrudeSpan(extent({ ...upToFace, operation: "cut" }), [-8]);
    expect(span.start).toBeCloseTo(-8.1);
    expect(span.end).toBe(0);
  });

  it("применяет смещение за грань и перед ней", () => {
    expect(browserExtrudeSpan(extent({ ...upToFace, offset: 2 }), [6])).toEqual({ start: 0, end: 8 });
    expect(browserExtrudeSpan(extent({ ...upToFace, offset: -2 }), [6])).toEqual({ start: 0, end: 4 });
    expect(() => browserExtrudeSpan(extent({ ...upToFace, offset: -6 }), [6])).toThrow("Смещение");
  });

  it("отклоняет грань в плоскости эскиза", () => {
    expect(() => browserExtrudeSpan(extent({ ...upToFace }), [0, 0])).toThrow("в плоскости эскиза");
  });

  it("отклоняет симметрию", () => {
    expect(() => browserExtrudeSpan(extent({ ...upToFace, direction: "symmetric" }), [6])).toThrow("Симметричное");
  });

  it("добавляет обратное расстояние", () => {
    expect(browserExtrudeSpan(extent({ ...upToFace, direction: "two_sided", backDistance: 2 }), [6])).toEqual({ start: -2, end: 6 });
  });
});

describe("browserExtrudeSpan: до тела", () => {
  const upToBody = { extentType: "up_to_body" as const };

  it("доходит до ближней точки тела со смещением", () => {
    expect(browserExtrudeSpan(extent({ ...upToBody, offset: 1 }), [12, 5, 9])).toEqual({ start: 0, end: 6 });
    expect(browserExtrudeSpan(extent({ ...upToBody, distance: -1 }), [-12, -5])).toEqual({ start: -5, end: 0 });
  });

  it("требует тело по направлению выдавливания", () => {
    expect(() => browserExtrudeSpan(extent({ ...upToBody }), [-12, -5])).toThrow("Реверс");
  });

  it("отклоняет тело, пересекающее плоскость эскиза", () => {
    expect(() => browserExtrudeSpan(extent({ ...upToBody }), [-2, 5])).toThrow("пересекает");
  });
});

describe("проекции", () => {
  it("проецирует точки на нормаль относительно плоскости", () => {
    expect(projectOntoNormal([[1, 2, 7], [0, 0, -1]], [0, 0, 2], [0, 0, 1])).toEqual([5, -3]);
  });

  it("строит восемь углов габаритов и разворачивает плоский массив", () => {
    expect(boxCorners([0, 0, 0], [1, 2, 3])).toHaveLength(8);
    expect(boxCorners([0, 0, 0], [1, 2, 3])).toContainEqual([1, 2, 3]);
    expect(flatPoints([1, 2, 3, 4, 5, 6])).toEqual([[1, 2, 3], [4, 5, 6]]);
  });
});
