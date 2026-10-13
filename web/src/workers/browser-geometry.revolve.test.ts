import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SketchEntity } from "@/types/api";
import { bodyMetrics, buildFixture, type ShapeFixture } from "./testing/shapeFixture";
import { buildBody, circle, rectangle, send } from "./testing/workerHarness";
import { line, loadQuietWorker, revolveRequest } from "./testing/workerRequests";

vi.mock("replicad-opencascadejs/wasm?url", () => ({
  default: decodeURIComponent(new URL("../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm", import.meta.url).pathname),
}));

beforeAll(async () => {
  await loadQuietWorker();
}, 60_000);

const INNER = 5;
const OUTER = 10;
const HEIGHT = 4;
const section = [rectangle("rr", INNER, 0, OUTER, HEIGHT)];
const SECTION_AREA = (OUTER - INNER) * HEIGHT;
const COS45 = Math.SQRT1_2;

function ringVolume(inner: number, outer: number, height: number, degrees = 360): number {
  return Math.PI * (outer ** 2 - inner ** 2) * height * (degrees / 360);
}

function ringArea(inner: number, outer: number, height: number, degrees = 360): number {
  const full = 2 * Math.PI * (outer ** 2 - inner ** 2) + 2 * Math.PI * (outer + inner) * height;
  const caps = degrees === 360 ? 0 : 2 * (outer - inner) * height;
  return full * (degrees / 360) + caps;
}

function sector(degrees: number, min: ShapeFixture["min"], max: ShapeFixture["max"]): ShapeFixture {
  return { volume: ringVolume(INNER, OUTER, HEIGHT, degrees), area: ringArea(INNER, OUTER, HEIGHT, degrees), min, max, faces: 6, edges: 12 };
}

let nextBody = 1;
function build(entities: SketchEntity[], overrides: Record<string, unknown>, expected: ShapeFixture) {
  const key = `rv-${nextBody++}`;
  return buildFixture(revolveRequest(entities, `k-${key}`, overrides), key, expected);
}

describe("вращение: полный оборот (реальный OCCT/WASM)", () => {
  const fullRing: ShapeFixture = {
    volume: ringVolume(INNER, OUTER, HEIGHT),
    area: ringArea(INNER, OUTER, HEIGHT),
    min: [-10, 0, -10],
    max: [10, 4, 10],
    faces: 4,
    edges: 6,
  };

  it("прямоугольник вокруг оси Y даёт кольцо без торцов: объём по Паппу", async () => {
    expect(fullRing.volume).toBeCloseTo(2 * Math.PI * ((INNER + OUTER) / 2) * SECTION_AREA, 9);
    await build(section, {}, fullRing);
  });

  it("симметричный полный оборот совпадает с обычным", async () => {
    await build(section, { direction: "symmetric" }, fullRing);
  });

  it("профиль, касающийся оси, даёт сплошной цилиндр", async () => {
    await build([rectangle("rr", 0, 0, 5, 10)], {}, {
      volume: Math.PI * 25 * 10,
      area: 2 * Math.PI * 25 + 2 * Math.PI * 5 * 10,
      min: [-5, 0, -5],
      max: [5, 10, 5],
      faces: 3,
      edges: 3,
    });
  });

  it("круг даёт тор: объём и площадь по Паппу", async () => {
    const major = 10;
    const minor = 2;
    await build([circle("c", major, 0, minor)], {}, {
      volume: 2 * Math.PI ** 2 * major * minor ** 2,
      area: 4 * Math.PI ** 2 * major * minor,
      min: [-12, -2, -12],
      max: [12, 2, 12],
      faces: 1,
      edges: 2,
    });
  });

  it("треугольник из отрезков даёт двойной конус с отверстием", async () => {
    const triangleArea = 0.5 * 6 * 4;
    const centroidRadius = (4 + 10 + 4) / 3;
    const slant = Math.hypot(6, 2);
    await build([line("a", 4, 0, 10, 2), line("b", 10, 2, 4, 4), line("c", 4, 4, 4, 0)], {}, {
      volume: 2 * Math.PI * centroidRadius * triangleArea,
      area: 2 * Math.PI * 4 * 4 + 2 * (Math.PI * (4 + 10) * slant),
      min: [-10, 0, -10],
      max: [10, 4, 10],
      faces: 3,
      edges: 6,
    });
  });

  it("смещённая ось меняет радиусы кольца", async () => {
    await build(section, { axisOrigin: { x: 2, y: 0 } }, {
      volume: ringVolume(3, 8, HEIGHT),
      area: ringArea(3, 8, HEIGHT),
      min: [-6, 0, -8],
      max: [10, 4, 8],
      faces: 4,
      edges: 6,
    });
  });

  it("несколько контуров дают одно тело из двух колец", async () => {
    await build([rectangle("r1", 5, 0, 7, 2), rectangle("r2", 10, 0, 12, 2)], {}, {
      volume: ringVolume(5, 7, 2) + ringVolume(10, 12, 2),
      area: ringArea(5, 7, 2) + ringArea(10, 12, 2),
      min: [-12, 0, -12],
      max: [12, 2, 12],
      faces: 8,
      edges: 12,
      solids: 2,
    });
  });
});

describe("вращение: на угол (реальный OCCT/WASM)", () => {
  it("четверть оборота вокруг +Y уводит профиль из +X в -Z и закрывает сектор двумя торцами", async () => {
    await build(section, { angle: 90 }, sector(90, [0, 0, -10], [10, 4, 0]));
  });

  it("симметричная четверть делится пополам по обе стороны плоскости эскиза", async () => {
    await build(section, { angle: 90, direction: "symmetric" }, sector(90, [INNER * COS45, 0, -OUTER * COS45], [10, 4, OUTER * COS45]));
  });

  it("пол-оборота даёт половину объёма кольца", async () => {
    await build(section, { angle: 180 }, sector(180, [-10, 0, -10], [10, 4, 0]));
  });

  it("три четверти оборота оставляют вырез в четверть", async () => {
    await build(section, { angle: 270 }, sector(270, [-10, 0, -10], [10, 4, 10]));
  });

  it("ось X: пол-оборота уводит профиль из +Y через +Z в -Y", async () => {
    await build([rectangle("rr", 0, INNER, HEIGHT, OUTER)], { axis: "x", angle: 180 }, sector(180, [0, -10, 0], [4, 10, 10]));
  });

  it("эскиз на XZ вращается вокруг мировой Z", async () => {
    await build(section, { plane: "XZ", angle: 90 }, sector(90, [0, 0, 0], [10, 10, 4]));
  });

  it("эскиз на YZ со смещением вращается вокруг оси в своей плоскости и уходит из +Y в -X", async () => {
    await build(section, { plane: "YZ", planeOffset: 3, angle: 90 }, sector(90, [-7, 0, 0], [3, 10, 4]));
  });
});

describe("вращение: отказы (реальный OCCT/WASM)", () => {
  it.each<[string, SketchEntity[], Record<string, unknown>]>([
    ["незамкнутый контур", [line("a", 5, 0, 10, 0), line("b", 10, 0, 10, 4)], {}],
    ["пустой эскиз", [], {}],
    ["профиль, пересекающий ось вращения", [rectangle("rr", -5, 0, 10, 4)], {}],
  ])("отклоняет: %s", async (_name, entities, overrides) => {
    const reply = await send(revolveRequest(entities, "k-rv-rejected", overrides));

    expect(reply.ok).toBe(false);
    expect(reply.error).toBeTruthy();
    expect(reply.shapeHandle).toBeUndefined();
  });

  describe("диапазон угла", () => {
    beforeAll(async () => {
      await buildBody(revolveRequest(section, "k-rv-zero", { angle: 0 }), "rv-zero");
      await buildBody(revolveRequest(section, "k-rv-over", { angle: 400 }), "rv-over");
    });

    it.fails("нулевой угол должен отклоняться: сейчас ядро отвечает ok и отдаёт невалидное тело нулевого объёма", () => {
      const degenerate = bodyMetrics("rv-zero");

      expect(degenerate.valid).toBe(true);
      expect(degenerate.volume).toBeGreaterThan(0);
    });

    it.fails("угол больше 360° должен отклоняться или давать полный оборот: сейчас 400° молча строится как 40°", () => {
      expect(bodyMetrics("rv-over").volume).toBeCloseTo(ringVolume(INNER, OUTER, HEIGHT), 6);
    });
  });
});
