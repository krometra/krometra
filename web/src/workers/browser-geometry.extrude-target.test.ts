import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatedFaceName } from "@/lib/browserNaming";
import { bodyMetrics, boxFixture, buildFixture, expectMetrics, expectNear, SHAPE_TOLERANCE, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, extrudeRequest, rectangle, send } from "./testing/workerHarness";
import { line, loadQuietWorker } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

const BASE = "et-base";
const STEPPED = "et-stepped";
const JOIN_THROUGH = "et-join-through";
const CUT_TO_STEP = "et-cut-to-step";
const WEDGE = "et-wedge";
const WEDGE_KEY = "k-et-wedge";
const BASE_KEY = "k-et-base";
const BASE_VOLUME = 2000;
const BASE_AREA = 1000;
const STEPPED_VOLUME = 3000;
const baseFixture = boxFixture([0, 0, 0], [20, 10, 10]);
const baseTop = generatedFaceName(BASE_KEY, "end:r.0");
const baseBottom = generatedFaceName(BASE_KEY, "start:r.0");
const cylinderVolume = (radius: number, height: number) => Math.PI * radius ** 2 * height;
const cylinderSide = (radius: number, height: number) => 2 * Math.PI * radius * height;

beforeAll(async () => {
  await loadQuietWorker();
  await buildBody(extrudeRequest([rectangle("r", 0, 0, 20, 10)], BASE_KEY), BASE);
  await buildBody(extrudeRequest([rectangle("tower", 0, 0, 10, 10)], "k-et-tower", {
    planeOffset: 10, operation: "join", targetBodyId: BASE,
  }), STEPPED);
  await buildBody(extrudeRequest([line("base", 0, 0, 10, 0), line("slope", 10, 0, 0, 5), line("back", 0, 5, 0, 0)], WEDGE_KEY, { plane: "XZ" }), WEDGE);
  await buildBody(extrudeRequest([circle("c", 5, 5, 2)], "k-et-join-through", {
    planeOffset: 40, distance: -1, extentType: "through_all", operation: "join", targetBodyId: BASE,
  }), JOIN_THROUGH);
  await buildBody(extrudeRequest([circle("c", 5, 5, 2)], "k-et-cut-to-step", {
    planeOffset: 20, extentType: "up_to_face", upToBodyId: STEPPED, upToFaceId: baseTop, operation: "cut", targetBodyId: STEPPED,
  }), CUT_TO_STEP);
}, 60_000);

let nextBody = 1;
function build(overrides: Record<string, unknown>, expected: ShapeFixture, entities = [circle("c", 10, 5, 3)]) {
  const key = `et-${nextBody++}`;
  return buildFixture(extrudeRequest(entities, `k-${key}`, { targetBodyId: BASE, ...overrides }), key, expected);
}

function post(overrides: Record<string, unknown>, expected: ShapeFixture) {
  return build({ planeOffset: 40, distance: -1, targetBodyId: null, ...overrides }, expected, [circle("c", 5, 5, 2)]);
}

function postFixture(bottom: number, top: number): ShapeFixture {
  return {
    volume: cylinderVolume(2, top - bottom),
    area: 2 * Math.PI * 2 ** 2 + cylinderSide(2, top - bottom),
    min: [3, 3, bottom],
    max: [7, 7, top],
    faces: 3,
    edges: 3,
  };
}

const throughHole: ShapeFixture = {
  volume: BASE_VOLUME - cylinderVolume(3, 10),
  area: BASE_AREA - 2 * Math.PI * 3 ** 2 + cylinderSide(3, 10),
  min: [0, 0, 0],
  max: [20, 10, 10],
  faces: 7,
  edges: 15,
};

describe("приклеивание выдавливанием (реальный OCCT/WASM)", () => {
  it("бобышка на верхней грани прибавляет объём цилиндра и одну боковую грань с крышкой", async () => {
    await build({ planeOffset: 10, distance: 5, operation: "join" }, {
      volume: BASE_VOLUME + cylinderVolume(3, 5),
      area: BASE_AREA + cylinderSide(3, 5),
      min: [0, 0, 0],
      max: [20, 10, 15],
      faces: 8,
      edges: 15,
    });
  });

  it("реверс приклеивает бобышку под нижнюю грань", async () => {
    await build({ distance: -5, operation: "join" }, {
      volume: BASE_VOLUME + cylinderVolume(3, 5),
      area: BASE_AREA + cylinderSide(3, 5),
      min: [0, 0, -5],
      max: [20, 10, 10],
      faces: 8,
      edges: 15,
    });
  });

  it("симметричное приклеивание от верхней грани прибавляет только выступающую половину", async () => {
    await build({ planeOffset: 10, distance: 6, direction: "symmetric", operation: "join" }, {
      volume: BASE_VOLUME + cylinderVolume(3, 3),
      area: BASE_AREA + cylinderSide(3, 3),
      min: [0, 0, 0],
      max: [20, 10, 13],
      faces: 8,
      edges: 15,
    });
  });

  it("приклеивание до верхней грани тела опускает стойку ровно до грани", async () => {
    await build({ planeOffset: 40, distance: -1, extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseTop, operation: "join" }, {
      volume: BASE_VOLUME + cylinderVolume(2, 30),
      area: BASE_AREA + cylinderSide(2, 30),
      min: [0, 0, 0],
      max: [20, 10, 40],
      faces: 8,
      edges: 15,
    }, [circle("c", 5, 5, 2)]);
  });

  it("инструмент целиком внутри тела отклоняется, цель остаётся прежней", async () => {
    const reply = await send(extrudeRequest([circle("c", 10, 5, 3)], "k-et-inside", { planeOffset: 2, distance: 4, operation: "join", targetBodyId: BASE }));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/не пересёк тело/);
    expectMetrics(bodyMetrics(BASE), baseFixture);
  });

  it("приклеивание насквозь проходит всё тело и остаётся одним валидным solid", () => {
    const joined = bodyMetrics(JOIN_THROUGH);

    expect(joined.valid).toBe(true);
    expect(joined.solids).toBe(1);
    expectNear(joined.max[2], 40, 1e-6, "верх стойки на плоскости эскиза");
    expect(joined.min[2]).toBeLessThanOrEqual(1e-6);
  });

  it.fails("приклеивание насквозь не должно выступать за дальнюю грань тела: сейчас стойка торчит на 1 мм (THROUGH_ALL_MARGIN)", () => {
    expectNear(bodyMetrics(JOIN_THROUGH).min[2], 0, 1e-6, "нижняя граница тела");
  });
});

describe("вырез выдавливанием (реальный OCCT/WASM)", () => {
  it("глухой карман убирает цилиндр и добавляет стенку с дном", async () => {
    await build({ planeOffset: 10, distance: -4, operation: "cut" }, {
      volume: BASE_VOLUME - cylinderVolume(3, 4),
      area: BASE_AREA + cylinderSide(3, 4),
      min: [0, 0, 0],
      max: [20, 10, 10],
      faces: 8,
      edges: 15,
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ["в одну сторону от верхней грани", { planeOffset: 10, distance: -1 }],
    ["в одну сторону от нижней грани", { planeOffset: 0, distance: 1 }],
    ["симметрично от плоскости внутри тела", { planeOffset: 4, direction: "symmetric" }],
    ["в обе стороны от плоскости внутри тела", { planeOffset: 4, direction: "two_sided", backDistance: 1 }],
    ["от плоскости далеко над телом", { planeOffset: 50, distance: -1 }],
  ])("вырез насквозь %s даёт сквозное отверстие во всю толщину", async (_name, overrides) => {
    await build({ ...overrides, extentType: "through_all", operation: "cut" }, throughHole);
  });

  it("два круга одним эскизом дают два сквозных отверстия", async () => {
    await build({ planeOffset: 10, distance: -1, extentType: "through_all", operation: "cut" }, {
      volume: BASE_VOLUME - 2 * cylinderVolume(2, 10),
      area: BASE_AREA - 4 * Math.PI * 2 ** 2 + 2 * cylinderSide(2, 10),
      min: [0, 0, 0],
      max: [20, 10, 10],
      faces: 8,
      edges: 18,
    }, [circle("left", 5, 5, 2), circle("right", 15, 5, 2)]);
  });

  it("вырез до нижней грани по её имени проходит тело насквозь", async () => {
    await build({ planeOffset: 10, extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseBottom, operation: "cut" }, throughHole);
  });

  it("вырез до ступени внутри тела режет отверстие от плоскости эскиза и не меняет габарит", () => {
    const cut = bodyMetrics(CUT_TO_STEP);

    expect(cut.valid).toBe(true);
    expect(cut.solids).toBe(1);
    expect(cut.min).toEqual([0, 0, 0]);
    expect(cut.max).toEqual([20, 10, 20]);
    expect(STEPPED_VOLUME - cut.volume).toBeGreaterThanOrEqual(cylinderVolume(2, 10) - 1e-6);
  });

  it.fails("вырез до грани внутри тела должен останавливаться на грани: сейчас уходит на 0.1 мм глубже (CUT_FACE_EXTEND)", () => {
    const expected = STEPPED_VOLUME - cylinderVolume(2, 10);

    expectNear(bodyMetrics(CUT_TO_STEP).volume, expected, expected * SHAPE_TOLERANCE, "объём после выреза до ступени");
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["вырез в сторону от тела не меняет объём", { planeOffset: 10, distance: 4 }, /не пересёк тело/],
    ["вырез мимо тела в плане не меняет объём", { planeOffset: 10, distance: -4, entities: [circle("c", 100, 5, 3)] }, /не пересёк тело/],
    ["вырез насквозь в сторону от тела", { planeOffset: 10, distance: 1, extentType: "through_all" }, /Реверс/],
    ["симметричный вырез до грани", { planeOffset: 10, direction: "symmetric", extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseBottom }, /Симметричное/],
    ["вырез из тела, которого нет в ядре", { planeOffset: 10, distance: -4, targetBodyId: "et-missing" }, /не загружено/],
  ])("отклоняет: %s, цель остаётся прежней", async (_name, overrides, message) => {
    const reply = await send(extrudeRequest([circle("c", 10, 5, 3)], "k-et-rejected", { operation: "cut", targetBodyId: BASE, ...overrides }));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(message);
    expectMetrics(bodyMetrics(BASE), baseFixture);
  });
});

describe("выдавливание до грани и до тела (реальный OCCT/WASM)", () => {
  it.each<[string, Record<string, unknown>, number]>([
    ["до грани по её имени", { extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseTop }, 10],
    ["до грани по точкам меша, когда имени нет", { extentType: "up_to_face", upToFacePoints: [[0, 0, 10], [20, 10, 10]] }, 10],
    ["до грани с положительным смещением заходит за грань", { extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseTop, offset: 3 }, 7],
    ["до грани с отрицательным смещением не доходит до грани", { extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseTop, offset: -3 }, 13],
    ["до грани не зависит от знака расстояния", { extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseTop, distance: 1 }, 10],
    ["до тела останавливается на ближайшей точке тела", { extentType: "up_to_body", upToBodyId: BASE }, 10],
    ["до тела со смещением заходит в тело на величину смещения", { extentType: "up_to_body", upToBodyId: BASE, offset: 2 }, 8],
    ["до тела с отрицательным смещением оставляет зазор", { extentType: "up_to_body", upToBodyId: BASE, offset: -2 }, 12],
  ])("%s", async (_name, overrides, bottom) => {
    await post(overrides, postFixture(bottom, 40));
  });

  it("до тела в обе стороны добавляет обратное расстояние от плоскости эскиза", async () => {
    await post({ extentType: "up_to_body", upToBodyId: BASE, direction: "two_sided", backDistance: 4 }, postFixture(10, 44));
  });

  it("до наклонной грани клина доходит до её дальней точки", async () => {
    await post({ planeOffset: 20, extentType: "up_to_face", upToBodyId: WEDGE, upToFaceId: generatedFaceName(WEDGE_KEY, "side:slope") }, postFixture(0, 20));
  });

  it("до нижней грани тела проходит сквозь тело до дальней грани", async () => {
    await post({ extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseBottom }, postFixture(0, 40));
  });

  it.each<[string, Record<string, unknown>, RegExp]>([
    ["до тела, которое лежит в обратной стороне", { extentType: "up_to_body", upToBodyId: BASE, distance: 1 }, /Реверс/],
    ["до тела, которого касается плоскость эскиза", { extentType: "up_to_body", upToBodyId: BASE, planeOffset: 10 }, /касается или пересекает/],
    ["до грани в плоскости эскиза", { extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseTop, planeOffset: 10 }, /в плоскости эскиза/],
    ["до грани со смещением, съедающим всю длину", { extentType: "up_to_face", upToBodyId: BASE, upToFaceId: baseTop, offset: -30 }, /Смещение/],
    ["до тела симметрично", { extentType: "up_to_body", upToBodyId: BASE, direction: "symmetric" }, /Симметричное/],
  ])("отклоняет: %s", async (_name, overrides, message) => {
    const reply = await send(extrudeRequest([circle("c", 5, 5, 2)], "k-et-extent-rejected", { planeOffset: 40, distance: -1, ...overrides }));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(message);
  });
});
