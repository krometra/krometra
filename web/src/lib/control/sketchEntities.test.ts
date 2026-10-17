import { describe, expect, it } from "vitest";
import { parseParams } from "./params";
import { ControlError } from "./protocol";
import { assignEntityIds, sketchEntitiesParam, type SketchEntityInput } from "./sketchEntities";

const schema = { entities: sketchEntitiesParam("Сущности.") };

function read(entities: unknown): SketchEntityInput[] {
  return parseParams(schema, { entities }).entities;
}

function rejected(entities: unknown): boolean {
  try {
    read(entities);
    return false;
  } catch (error) {
    return error instanceof ControlError && error.code === "invalid_params";
  }
}

describe("sketchEntitiesParam", () => {
  it("принимает четыре вида сущностей и отбрасывает посторонние поля", () => {
    const entities = read([
      { type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, construction: true, colour: "red" },
      { type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 4, y: 3 } },
      { type: "circle", center: { x: 1, y: 2 }, radius: 5, id: "hole" },
      { type: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI },
    ]);
    expect(entities).toEqual([
      { type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, construction: true },
      { type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 4, y: 3 } },
      { type: "circle", center: { x: 1, y: 2 }, radius: 5, id: "hole" },
      { type: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI },
    ]);
  });

  it("отклоняет вырожденную и неполную геометрию", () => {
    expect(rejected([{ type: "line", start: { x: 1, y: 1 }, end: { x: 1, y: 1 } }])).toBe(true);
    expect(rejected([{ type: "line", start: { x: 1, y: 1 } }])).toBe(true);
    expect(rejected([{ type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 0, y: 5 } }])).toBe(true);
    expect(rejected([{ type: "circle", center: { x: 0, y: 0 }, radius: 0 }])).toBe(true);
    expect(rejected([{ type: "circle", center: { x: 0, y: "0" }, radius: 1 }])).toBe(true);
    expect(rejected([{ type: "arc", center: { x: 0, y: 0 }, radius: 1, startAngle: 1, endAngle: 1 }])).toBe(true);
  });

  it("отклоняет неизвестный тип, пустой список и не-объекты", () => {
    expect(rejected([{ type: "spline", points: [] }])).toBe(true);
    expect(rejected([{ type: "toString" }])).toBe(true);
    expect(rejected([])).toBe(true);
    expect(rejected([[0, 0, 1, 1]])).toBe(true);
    expect(rejected("line")).toBe(true);
  });

  it("прямоугольник бывает вспомогательным, и при повороте массивом его стороны тоже", () => {
    const rectangle = { type: "rectangle", corner1: { x: 5, y: -1 }, corner2: { x: 7, y: 1 }, construction: true };
    expect(read([rectangle])).toEqual([{ ...rectangle }]);
    const turned = read([{ type: "circular_pattern", count: 3, center: { x: 0, y: 0 }, entities: [rectangle] }]);
    expect(turned.filter((entity) => entity.type === "line").every((entity) => entity.construction === true)).toBe(true);
  });

  it("отклоняет неверные id и construction", () => {
    expect(rejected([{ type: "circle", center: { x: 0, y: 0 }, radius: 1, id: 7 }])).toBe(true);
    expect(rejected([{ type: "circle", center: { x: 0, y: 0 }, radius: 1, construction: "yes" }])).toBe(true);
  });
});

describe("assignEntityIds", () => {
  const circle = (id?: string): SketchEntityInput => ({ type: "circle", center: { x: 0, y: 0 }, radius: 1, ...(id ? { id } : {}) });

  it("сохраняет заданные id и выдаёт уникальные остальным", () => {
    const entities = assignEntityIds([circle("mine"), circle(), circle()], ["existing"], 1700);
    expect(entities.map((entity) => entity.id)).toEqual(["mine", "control-entity-1700-1", "control-entity-1700-2"]);
  });

  it("обходит id, уже занятые в эскизе", () => {
    const entities = assignEntityIds([circle()], ["control-entity-5-1"], 5);
    expect(entities[0].id).toBe("control-entity-5-2");
  });

  it("не даёт перезаписать существующую сущность и повторить id в одном запросе", () => {
    expect(() => assignEntityIds([circle("boss")], ["boss"], 1)).toThrow(/boss/);
    expect(() => assignEntityIds([circle("a"), circle("a")], [], 1)).toThrow(ControlError);
  });
});

describe("массивы сущностей", () => {
  const hole = { type: "circle", center: { x: 0, y: 0 }, radius: 0.5, id: "pin" };

  it("линейный массив сеткой раскрывается в копии с id через суффикс", () => {
    const entities = read([{ type: "linear_pattern", entities: [hole], count: 3, step: { x: 2.54, y: 0 }, count2: 2, step2: { x: 0, y: 2.54 } }]);
    expect(entities).toHaveLength(6);
    expect(entities.map((entity) => entity.id)).toEqual(["pin", "pin-1", "pin-2", "pin-3", "pin-4", "pin-5"]);
    expect(entities[5]).toMatchObject({ type: "circle", center: { x: 5.08, y: 2.54 } });
  });

  it("круговой массив поворачивает центр и углы дуг", () => {
    const entities = read([
      {
        type: "circular_pattern",
        count: 4,
        center: { x: 0, y: 0 },
        entities: [{ type: "arc", center: { x: 10, y: 0 }, radius: 1, startAngle: 0, endAngle: 1 }],
      },
    ]) as Extract<SketchEntityInput, { type: "arc" }>[];
    expect(entities).toHaveLength(4);
    expect(entities[1].center.x).toBeCloseTo(0, 9);
    expect(entities[1].center.y).toBeCloseTo(10, 9);
    expect(entities[1].startAngle).toBeCloseTo(Math.PI / 2, 9);
  });

  it("повёрнутый прямоугольник становится четырьмя отрезками", () => {
    const entities = read([
      { type: "circular_pattern", count: 8, center: { x: 0, y: 0 }, entities: [{ type: "rectangle", corner1: { x: 5, y: -1 }, corner2: { x: 7, y: 1 } }] },
    ]);
    expect(entities.filter((entity) => entity.type === "rectangle")).toHaveLength(4);
    expect(entities.filter((entity) => entity.type === "line")).toHaveLength(16);
  });

  it("отклоняет пустой, слишком большой и неполный массив", () => {
    expect(rejected([{ type: "linear_pattern", entities: [], count: 2, step: { x: 1, y: 0 } }])).toBe(true);
    expect(rejected([{ type: "linear_pattern", entities: [hole], count: 501, step: { x: 1, y: 0 } }])).toBe(true);
    expect(rejected([{ type: "linear_pattern", entities: [hole], count: 50, step: { x: 1, y: 0 }, count2: 50 }])).toBe(true);
    expect(rejected([{ type: "circular_pattern", entities: [hole], count: 3 }])).toBe(true);
  });
});
