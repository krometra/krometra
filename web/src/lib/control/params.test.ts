import { describe, expect, it } from "vitest";
import { describeParams, param, parseParams } from "./params";
import { ControlError } from "./protocol";

const schema = {
  bodyId: param.id("Тело."),
  radius: param.number("Радиус.", { above: 0 }),
  starts: param.optional(param.integer("Заходы.", { min: 1 })),
  operation: param.optional(param.oneOf(["join", "cut"], "Операция.")),
  position: param.optional(param.vec3("Позиция.")),
  points: param.optional(param.list(param.vec2("Точка."), "Точки.")),
  flag: param.optional(param.boolean("Флаг.")),
  color: param.optional(param.color("Цвет.")),
};

function invalid(raw: unknown): string {
  try {
    parseParams(schema, raw);
  } catch (error) {
    expect(error).toBeInstanceOf(ControlError);
    expect((error as ControlError).code).toBe("invalid_params");
    return (error as ControlError).message;
  }
  throw new Error("ожидалась ошибка invalid_params");
}

describe("parseParams", () => {
  it("возвращает разобранные значения и не добавляет пропущенные необязательные", () => {
    expect(parseParams(schema, { bodyId: "b1", radius: 2 })).toEqual({ bodyId: "b1", radius: 2 });
  });

  it("числовой идентификатор приводит к строке", () => {
    expect(parseParams(schema, { bodyId: 7, radius: 2 }).bodyId).toBe("7");
  });

  it("null у необязательного параметра равен его отсутствию", () => {
    expect(parseParams(schema, { bodyId: "b", radius: 1, starts: null })).toEqual({ bodyId: "b", radius: 1 });
  });

  it("называет пропущенный обязательный параметр", () => {
    expect(invalid({ bodyId: "b" })).toContain("«radius»");
    expect(invalid(undefined)).toContain("«bodyId»");
  });

  it("отклоняет неизвестный параметр и перечисляет допустимые", () => {
    const message = invalid({ bodyId: "b", radius: 1, raduis: 3 });
    expect(message).toContain("raduis");
    expect(message).toContain("radius");
  });

  it("проверяет границы числа и целочисленность", () => {
    expect(invalid({ bodyId: "b", radius: 0 })).toContain("больше 0");
    expect(invalid({ bodyId: "b", radius: 1, starts: 1.5 })).toContain("«starts»");
    expect(invalid({ bodyId: "b", radius: 1, starts: 0 })).toContain("не меньше 1");
    expect(invalid({ bodyId: "b", radius: Number.NaN })).toContain("«radius»");
  });

  it("проверяет перечисление, вектор, список и булево", () => {
    expect(invalid({ bodyId: "b", radius: 1, operation: "glue" })).toContain("join | cut");
    expect(invalid({ bodyId: "b", radius: 1, position: [1, 2] })).toContain("3 чисел");
    expect(invalid({ bodyId: "b", radius: 1, points: [[1, 2], [3]] })).toContain("«points»");
    expect(invalid({ bodyId: "b", radius: 1, points: [] })).toContain("«points»");
    expect(invalid({ bodyId: "b", radius: 1, flag: "yes" })).toContain("«flag»");
  });

  it("цвет принимает только #rrggbb и приводит к нижнему регистру", () => {
    expect(parseParams(schema, { bodyId: "b", radius: 1, color: "#FFAA00" }).color).toBe("#ffaa00");
    expect(invalid({ bodyId: "b", radius: 1, color: "red" })).toContain("#rrggbb");
  });

  it("params обязан быть объектом", () => {
    expect(invalid([1, 2])).toContain("params");
    expect(invalid("bodyId")).toContain("params");
  });

  it("не отдаёт наружу ссылку на входной массив", () => {
    const position = [1, 2, 3];
    const parsed = parseParams(schema, { bodyId: "b", radius: 1, position });
    expect(parsed.position).toEqual(position);
    expect(parsed.position).not.toBe(position);
  });
});

describe("describeParams", () => {
  it("отдаёт только поля контракта", () => {
    expect(describeParams(schema).radius).toEqual({ type: "number", required: true, description: "Радиус." });
    expect(describeParams(schema).starts).toEqual({ type: "integer", required: false, description: "Заходы." });
    expect(describeParams(schema).operation.description).toBe("Операция. Допустимо: join | cut.");
    expect(describeParams(schema).position.type).toBe("array");
  });
});
