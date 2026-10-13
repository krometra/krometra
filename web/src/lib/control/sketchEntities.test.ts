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
