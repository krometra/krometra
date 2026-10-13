import { describe, expect, it } from "vitest";
import {
  axialExtent,
  axisBasis,
  dot,
  helixRings,
  helixTriangles,
  isoDepth,
  isOutwardNormal,
  orientCylinderAxis,
  pointsOnCylinder,
  resolveThreadPlan,
  segmentsFor,
  startAngles,
  threadLabel,
  threadOvershoot,
  threadProfile,
  type ThreadCylinderInfo,
  type ThreadOptions,
} from "./threadGeometry";

const rod: ThreadCylinderInfo = { radius: 5, origin: [0, 0, 0], direction: [0, 0, 1], start: 0, length: 20, external: true };
const options: ThreadOptions = { pitch: 1.5, depth: null, length: null, offset: 0, crestRatio: 0, starts: 1, rightHanded: true };

function planError(cylinder: ThreadCylinderInfo, override: Partial<ThreadOptions>) {
  try {
    resolveThreadPlan(cylinder, { ...options, ...override });
    return null;
  } catch (error) {
    return (error as { code: string }).code;
  }
}

describe("параметры профиля", () => {
  it("метрическая глубина — 0.613 шага", () => {
    expect(isoDepth(1.5)).toBeCloseTo(0.9195);
  });

  it("число сегментов на оборот зажато между 24 и 64", () => {
    expect(segmentsFor(0)).toBe(24);
    expect(segmentsFor(5)).toBe(25);
  });

  it("выступ клина покрывает провис хорды", () => {
    const sagitta = 20 * (1 - Math.cos(Math.PI / 24));
    expect(threadOvershoot(20, 0.5, 24)).toBeCloseTo(sagitta * 1.35);
    expect(threadOvershoot(5, 1, 64)).toBeCloseTo(0.06);
  });

  it("острый профиль внешней резьбы режет внутрь", () => {
    expect(threadProfile(5, 1, 2, true, 0, 0.1)).toEqual([[5.1, -1], [5.1, 1], [4, 0]]);
  });

  it("трапеция внутренней резьбы растёт наружу и ограничивает вершину", () => {
    const profile = threadProfile(5, 1, 2, false, 0.99, 0.1);
    expect(profile[0][0]).toBeCloseTo(4.9);
    expect(profile[2]).toEqual([6, 0.98]);
    expect(profile).toHaveLength(4);
  });
});

describe("ось цилиндра", () => {
  it("строит ортонормированный базис поперёк оси", () => {
    const { u, v } = axisBasis([0, 0, 1]);
    expect(dot(u, [0, 0, 1])).toBeCloseTo(0);
    expect(dot(v, [0, 0, 1])).toBeCloseTo(0);
    expect(dot(u, v)).toBeCloseTo(0);
    expect(Math.hypot(...v)).toBeCloseTo(1);
  });

  it("разворачивает ось, если грань лежит позади origin", () => {
    const extent = axialExtent([[5, 0, 0], [5, 0, 10]], [0, 0, 0], [0, 0, -1]);
    expect(extent[0]).toBeCloseTo(-10);
    expect(extent[1]).toBeCloseTo(0);
    expect(orientCylinderAxis([0, 0, -1], extent)).toEqual({ direction: [0, 0, 1], start: 0, end: 10 });
  });

  it("нормаль от оси — стержень, к оси — отверстие", () => {
    expect(isOutwardNormal([5, 0, 3], [1, 0, 0], [0, 0, 0], [0, 0, 1])).toBe(true);
    expect(isOutwardNormal([5, 0, 3], [-1, 0, 0], [0, 0, 0], [0, 0, 1])).toBe(false);
  });

  it("узнаёт грань по точкам mesh на поверхности цилиндра", () => {
    expect(pointsOnCylinder([[5, 0, 1], [0, 5, 19]], rod, 1e-3)).toBe(true);
    expect(pointsOnCylinder([[5, 0, 1], [0, 4, 19]], rod, 1e-3)).toBe(false);
    expect(pointsOnCylinder([[5, 0, 25]], rod, 1e-3)).toBe(false);
    expect(pointsOnCylinder([], rod, 1e-3)).toBe(false);
  });
});

describe("план резьбы", () => {
  it("по умолчанию режет всю грань с метрической глубиной и свесом клина", () => {
    const plan = resolveThreadPlan({ ...rod, start: 2 }, { ...options, offset: 1 });
    expect(plan.length).toBe(19);
    expect(plan.depth).toBeCloseTo(0.9195);
    expect(plan.clipFrom).toBe(3);
    expect(plan.clipTo).toBe(22);
    expect(plan.toolStart).toBeCloseTo(2.25);
    expect(plan.toolLength).toBeCloseTo(20.5);
  });

  it("подъём многозаходной резьбы кратен числу заходов", () => {
    const plan = resolveThreadPlan(rod, { ...options, pitch: 2, starts: 3 });
    expect(plan.lead).toBe(6);
    expect(startAngles(3)).toEqual([0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]);
  });

  it.each([
    [{ pitch: 0 }, "bad_pitch"],
    [{ depth: -1 }, "bad_depth"],
    [{ starts: 0 }, "bad_starts"],
    [{ crestRatio: 1 }, "bad_crest"],
    [{ length: 1 }, "length_too_small"],
    [{ length: 21 }, "length_too_large"],
    [{ depth: 5 }, "depth_too_large"],
  ] as [Partial<ThreadOptions>, string][])("отклоняет %o кодом %s", (override, code) => {
    expect(planError(rod, override)).toBe(code);
  });

  it("глубокая внутренняя резьба допустима", () => {
    expect(planError({ ...rod, external: false }, { depth: 6 })).toBeNull();
  });
});

describe("винтовой клин", () => {
  const plan = resolveThreadPlan(rod, { ...options, length: 3 });

  it("кольца идут по спирали с подъёмом за оборот", () => {
    const rings = helixRings(rod, plan, 0);
    const turns = plan.toolLength / plan.lead;
    expect(rings).toHaveLength(Math.round(segmentsFor(5) * turns) + 1);
    const first = rings[0][2];
    const last = rings[rings.length - 1][2];
    expect(last[2] - first[2]).toBeCloseTo(plan.toolLength);
    expect(Math.hypot(first[0], first[1])).toBeCloseTo(5 - plan.depth);
  });

  it("левая навивка закручивает в обратную сторону", () => {
    const right = helixRings(rod, plan, 0)[1][2];
    const left = helixRings(rod, { ...plan, rightHanded: false }, 0)[1][2];
    const { u, v } = axisBasis(rod.direction);
    expect(dot(right, u)).toBeCloseTo(dot(left, u));
    expect(dot(right, v)).toBeCloseTo(-dot(left, v));
    expect(Math.abs(dot(right, v))).toBeGreaterThan(0.1);
  });

  it("боковые грани разбиты на треугольники, торцы закрыты веером", () => {
    const rings = helixRings(rod, plan, 0);
    expect(helixTriangles(rings)).toHaveLength((rings.length - 1) * 3 * 2 + 2);
  });
});

it("подпись команды совпадает с серверной резьбой", () => {
  expect(threadLabel(true, 10, 1.5, 1)).toBe("Внешняя резьба M10×1.5");
  expect(threadLabel(false, 60, 6, 2)).toBe("Внутренняя резьба M60×6, 2 захода");
});
