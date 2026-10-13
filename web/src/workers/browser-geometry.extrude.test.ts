import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Vector3 } from "@/lib/browserExtrudeFrame";
import type { SketchEntity } from "@/types/api";
import { boxFixture, buildFixture, type ShapeFixture } from "./testing/shapeFixture";
import { circle, extrudeRequest, rectangle, send } from "./testing/workerHarness";
import { arc, constructionCircle, line, loadQuietWorker } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadQuietWorker();
}, 60_000);

const plate = [rectangle("r", 0, 0, 20, 10)];
const HEIGHT = 10;
const PLATE_AREA = 200;

let nextBody = 1;
function build(entities: SketchEntity[], overrides: Record<string, unknown>, expected: ShapeFixture) {
  const key = `ex-${nextBody++}`;
  return buildFixture(extrudeRequest(entities, `k-${key}`, overrides), key, expected);
}

describe("выдавливание нового тела: направление (реальный OCCT/WASM)", () => {
  it.each<[string, Record<string, unknown>, Vector3, Vector3]>([
    ["на расстояние идёт по нормали плоскости", {}, [0, 0, 0], [20, 10, 10]],
    ["реверс отрицательным расстоянием уходит против нормали", { distance: -10 }, [0, 0, -10], [20, 10, 0]],
    ["симметрично делит расстояние пополам по обе стороны", { direction: "symmetric" }, [0, 0, -5], [20, 10, 5]],
    ["симметрично не зависит от знака расстояния", { direction: "symmetric", distance: -10 }, [0, 0, -5], [20, 10, 5]],
    ["в обе стороны: вперёд 10 и назад 3", { direction: "two_sided", backDistance: 3 }, [0, 0, -3], [20, 10, 10]],
    ["в обе стороны с реверсом: 10 против нормали и 3 по нормали", { direction: "two_sided", distance: -10, backDistance: 3 }, [0, 0, -10], [20, 10, 3]],
  ])("%s", async (_name, overrides, min, max) => {
    await build(plate, overrides, boxFixture(min, max));
  });
});

describe("выдавливание нового тела: плоскость эскиза (реальный OCCT/WASM)", () => {
  it.each<[string, Record<string, unknown>, Vector3, Vector3]>([
    ["XY со смещением поднимает тело вдоль Z", { planeOffset: 7 }, [0, 0, 7], [20, 10, 17]],
    ["XZ кладёт эскиз в X-Z и выдавливает вдоль +Y", { plane: "XZ", planeOffset: 5 }, [0, 5, 0], [20, 15, 10]],
    ["YZ кладёт эскиз в Y-Z и выдавливает вдоль +X", { plane: "YZ", distance: 4 }, [0, 0, 0], [4, 20, 10]],
    [
      "произвольный базис грани задаёт начало и оси эскиза",
      { planeBasis: { origin: [1, 2, 3], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] }, distance: 5 },
      [1, 2, 3],
      [6, 22, 13],
    ],
  ])("%s", async (_name, overrides, min, max) => {
    await build(plate, overrides, boxFixture(min, max));
  });
});

describe("выдавливание нового тела: ориентация осей эскиза (реальный OCCT/WASM)", () => {
  const triangle = [line("a", 0, 0, 6, 0), line("b", 6, 0, 0, 8), line("c", 0, 8, 0, 0)];

  it.each<[string, Record<string, unknown>, number, Vector3, Vector3, Vector3]>([
    ["XY: x эскиза идёт по X, y эскиза по Y", { planeOffset: 7 }, 10, [0, 0, 7], [6, 8, 17], [2, 8 / 3, 12]],
    ["YZ: x эскиза идёт по Y, y эскиза по Z", { plane: "YZ", distance: 4 }, 4, [0, 0, 0], [4, 6, 8], [2, 2, 8 / 3]],
    [
      "правый базис грани: x эскиза по u, y эскиза по v, выдавливание по n",
      { planeBasis: { origin: [1, 2, 3], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] }, distance: 5 },
      5,
      [1, 2, 3],
      [6, 8, 11],
      [3.5, 4, 3 + 8 / 3],
    ],
    [
      "левый базис грани (u x v против n): профиль не зеркалится",
      { planeBasis: { origin: [0, 0, 3], u: [0, 1, 0], v: [1, 0, 0], n: [0, 0, 1] } },
      10,
      [0, 0, 3],
      [8, 6, 13],
      [8 / 3, 2, 8],
    ],
  ])("%s", async (_name, overrides, height, min, max, center) => {
    await build(triangle, overrides, { volume: 24 * height, area: 2 * 24 + (6 + 8 + 10) * height, min, max, center, faces: 5, edges: 9 });
  });
});

describe("выдавливание нового тела: профиль (реальный OCCT/WASM)", () => {
  it("круг даёт цилиндр: три грани, две окружности и шов", async () => {
    const radius = 5;
    await build([circle("c", 3, 4, radius)], {}, {
      volume: Math.PI * radius ** 2 * HEIGHT,
      area: 2 * Math.PI * radius ** 2 + 2 * Math.PI * radius * HEIGHT,
      min: [-2, -1, 0],
      max: [8, 9, 10],
      faces: 3,
      edges: 3,
    });
  });

  it("круг внутри прямоугольника вычитается как отверстие", async () => {
    const radius = 2;
    await build([...plate, circle("c", 10, 5, radius)], {}, {
      volume: (PLATE_AREA - Math.PI * radius ** 2) * HEIGHT,
      area: 2 * (PLATE_AREA - Math.PI * radius ** 2) + 60 * HEIGHT + 2 * Math.PI * radius * HEIGHT,
      min: [0, 0, 0],
      max: [20, 10, 10],
      faces: 7,
      edges: 15,
    });
  });

  it("прямоугольник внутри прямоугольника даёт рамку с четырьмя внутренними стенками", async () => {
    const window = 10 * 6;
    await build([...plate, rectangle("w", 5, 2, 15, 8)], {}, {
      volume: (PLATE_AREA - window) * HEIGHT,
      area: 2 * (PLATE_AREA - window) + (60 + 32) * HEIGHT,
      min: [0, 0, 0],
      max: [20, 10, 10],
      faces: 10,
      edges: 24,
    });
  });

  it("несвязанные регионы дают одно тело из двух solid", async () => {
    await build([rectangle("a", 0, 0, 10, 10), rectangle("b", 20, 0, 30, 10)], {}, {
      volume: 2 * 100 * HEIGHT,
      area: 2 * 600,
      min: [0, 0, 0],
      max: [30, 10, 10],
      faces: 12,
      edges: 24,
      solids: 2,
    });
  });

  it("вложенные контуры чередуются: кольцо, пустота, остров", async () => {
    const height = 2;
    const ring = Math.PI * (10 ** 2 - 8 ** 2);
    const island = Math.PI * 4 ** 2;
    await build([circle("outer", 0, 0, 10), circle("gap", 0, 0, 8), circle("island", 0, 0, 4)], { distance: height }, {
      volume: (ring + island) * height,
      area: 2 * (ring + island) + 2 * Math.PI * (10 + 8 + 4) * height,
      min: [-10, -10, 0],
      max: [10, 10, 2],
      faces: 8,
      edges: 12,
      solids: 2,
    });
  });

  it("замкнутая цепочка отрезков даёт призму по треугольнику 6-8-10", async () => {
    await build([line("a", 0, 0, 6, 0), line("b", 6, 0, 0, 8), line("c", 0, 8, 0, 0)], {}, {
      volume: 24 * HEIGHT,
      area: 2 * 24 + (6 + 8 + 10) * HEIGHT,
      min: [0, 0, 0],
      max: [6, 8, 10],
      faces: 5,
      edges: 9,
    });
  });

  it("цепочка отрезков, заданных в произвольном порядке и направлении, замыкается в тот же треугольник", async () => {
    await build([line("c", 0, 0, 0, 8), line("a", 0, 0, 6, 0), line("b", 0, 8, 6, 0)], {}, {
      volume: 24 * HEIGHT,
      area: 2 * 24 + (6 + 8 + 10) * HEIGHT,
      min: [0, 0, 0],
      max: [6, 8, 10],
      faces: 5,
      edges: 9,
    });
  });

  it("отрезки с дугами дают паз со скруглёнными торцами", async () => {
    const radius = 2;
    const height = 3;
    const profile = 10 * 2 * radius + Math.PI * radius ** 2;
    await build([
      line("bottom", 0, -radius, 10, -radius),
      arc("right", 10, 0, radius, -Math.PI / 2, Math.PI / 2),
      line("top", 10, radius, 0, radius),
      arc("left", 0, 0, radius, Math.PI / 2, (3 * Math.PI) / 2),
    ], { distance: height }, {
      volume: profile * height,
      area: 2 * profile + (2 * 10 + 2 * Math.PI * radius) * height,
      min: [-2, -2, 0],
      max: [12, 2, 3],
      faces: 6,
      edges: 12,
    });
  });

  it("вспомогательная геометрия не участвует в профиле", async () => {
    await build([...plate, constructionCircle("axis", 10, 5, 2)], {}, boxFixture([0, 0, 0], [20, 10, 10]));
  });
});

describe("выдавливание нового тела: отказы (реальный OCCT/WASM)", () => {
  it.each<[string, SketchEntity[], Record<string, unknown>, RegExp]>([
    ["незамкнутый контур", [line("a", 0, 0, 6, 0), line("b", 6, 0, 0, 8)], {}, /не замкнут/],
    ["пустой эскиз", [], {}, /нет замкнутого контура/],
    ["эскиз только из вспомогательной геометрии", [constructionCircle("axis", 0, 0, 2)], {}, /нет замкнутого контура/],
    ["нулевое расстояние", plate, { distance: 0 }, /нулевым/],
    ["в обе стороны без обратного расстояния", plate, { direction: "two_sided", backDistance: 0 }, /обратное расстояние/],
    ["насквозь без тела-цели", plate, { extentType: "through_all" }, /./],
    ["до грани без выбранной грани", plate, { extentType: "up_to_face" }, /грань/],
  ])("отклоняет: %s", async (_name, entities, overrides, message) => {
    const reply = await send(extrudeRequest(entities, "k-ex-rejected", overrides));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(message);
    expect(reply.shapeHandle).toBeUndefined();
  });
});
