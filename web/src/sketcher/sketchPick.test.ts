import { describe, expect, it } from "vitest";
import type { SketchEntity } from "@/types/api";
import { entityDistance, pickDrawableEntity, pickSketchAxis, pickSketchItem, pickSketchPoint } from "./sketchPick";
import { LINE_MIDPOINT, entityPointHandles, entityRefPoint, sketchPointHandles } from "./sketchPoints";

const line: SketchEntity = { id: "l", type: "line", start: { x: 10, y: 10 }, end: { x: 50, y: 10 } };
const edge: SketchEntity = { id: "face-edge-1-2", type: "line", start: { x: 10, y: 30 }, end: { x: 50, y: 30 }, construction: true };
const infline: SketchEntity = { id: "i", type: "infline", point: { x: 0, y: -40 }, angle: Math.PI / 4 };
const circle: SketchEntity = { id: "c", type: "circle", center: { x: 100, y: 50 }, radius: 20 };
const arc: SketchEntity = { id: "a", type: "arc", center: { x: -50, y: 50 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2 };
const entities = [line, edge, infline, circle, arc];

const pick = (x: number, y: number, threshold = 6) => pickSketchItem({ x, y }, entities, threshold);

describe("pickSketchItem: что выбирается под курсором", () => {
  it("конец отрезка — точка с номером, ховер показывает подпись", () => {
    expect(pick(11, 11)).toEqual({ item: { kind: "point", entityId: "l", subIndex: 0 }, at: { x: 10, y: 10 }, label: "Конец" });
    expect(pick(49, 10)).toMatchObject({ item: { kind: "point", entityId: "l", subIndex: 1 } });
  });

  it("точка в приоритете, пока курсор не ушёл на линию заметно ближе", () => {
    expect(pick(14, 10.5)).toMatchObject({ item: { kind: "entity", entityId: "l" } });
    expect(pick(11.5, 12)).toMatchObject({ item: { kind: "point", entityId: "l", subIndex: 0 } });
  });

  it("середина ловится в меньшем радиусе, рядом с ней — сам отрезок", () => {
    expect(pick(30.5, 10.5)).toMatchObject({ item: { kind: "point", entityId: "l", subIndex: LINE_MIDPOINT }, label: "Середина" });
    expect(pick(33.5, 10)).toMatchObject({ item: { kind: "entity", entityId: "l" } });
  });

  it("вспомогательный отрезок и ребро грани выбираются целиком и по точкам", () => {
    expect(pick(25, 31)).toMatchObject({ item: { kind: "entity", entityId: "face-edge-1-2" } });
    expect(pick(50, 29)).toMatchObject({ item: { kind: "point", entityId: "face-edge-1-2", subIndex: 1 } });
  });

  it("бесконечная прямая выбирается в любой своей точке", () => {
    expect(pick(200, 160.5)).toMatchObject({ item: { kind: "entity", entityId: "i" } });
  });

  it("центр окружности и концы дуги — точки, обод — объект", () => {
    expect(pick(100.5, 50)).toMatchObject({ item: { kind: "point", entityId: "c", subIndex: 0 }, label: "Центр" });
    expect(pick(119, 50)).toMatchObject({ item: { kind: "entity", entityId: "c" } });
    expect(pick(-50, 60.5)).toMatchObject({ item: { kind: "point", entityId: "a", subIndex: 2 } });
    expect(pick(-60, 50)).toBeNull();
  });

  it("начало координат — точка, оси — линии, объект на оси важнее оси", () => {
    expect(pick(0.5, 0.5)).toEqual({ item: { kind: "origin" }, at: { x: 0, y: 0 }, label: "Начало координат" });
    expect(pick(-150, 2)).toEqual({ item: { kind: "axis", axis: "x" }, at: null, label: null });
    expect(pick(-2, -150)).toMatchObject({ item: { kind: "axis", axis: "y" } });
    const onAxis: SketchEntity = { id: "x-line", type: "line", start: { x: -200, y: 0 }, end: { x: -100, y: 0 } };
    expect(pickSketchItem({ x: -170, y: 1 }, [onAxis], 6)).toMatchObject({ item: { kind: "entity", entityId: "x-line" } });
  });

  it("пустое место — ничего", () => {
    expect(pick(300, 300)).toBeNull();
  });
});

describe("вспомогательные функции попадания", () => {
  it("pickDrawableEntity пропускает вспомогательную геометрию", () => {
    expect(pickDrawableEntity({ x: 25, y: 31 }, entities, 6)).toBeNull();
    expect(pickDrawableEntity({ x: 25, y: 11 }, entities, 6)?.id).toBe("l");
  });

  it("pickSketchPoint берёт ближайшую из точек", () => {
    const touching: SketchEntity = { id: "m", type: "line", start: { x: 1.5, y: 0 }, end: { x: 1.5, y: 40 } };
    expect(pickSketchPoint({ x: 1.2, y: 0 }, [touching], 2)?.ref).toEqual({ entity_id: "m", sub_index: 0 });
    expect(pickSketchPoint({ x: 0.3, y: 0 }, [touching], 2)?.role).toBe("origin");
  });

  it("pickSketchAxis выбирает ближайшую ось", () => {
    expect(pickSketchAxis({ x: 3, y: 1 }, 5)).toBe("x");
    expect(pickSketchAxis({ x: 1, y: 3 }, 5)).toBe("y");
    expect(pickSketchAxis({ x: 10, y: 10 }, 5)).toBeNull();
  });

  it("entityDistance для бесконечной прямой — перпендикуляр", () => {
    expect(entityDistance({ x: 0, y: 0 }, { id: "h", type: "infline", point: { x: 5, y: 3 }, angle: 0 })).toBeCloseTo(3);
  });
});

describe("точки объектов совпадают с точками решателя", () => {
  it("номера точек: отрезок 0/1/2, окружность 0, дуга 0/1/2, прямоугольник 0..3", () => {
    expect(entityPointHandles(line).map((h) => `${h.ref.sub_index}:${h.role}`)).toEqual(["0:end", "1:end", "2:mid"]);
    expect(entityPointHandles(arc).map((h) => h.role)).toEqual(["center", "end", "end"]);
    expect(entityPointHandles({ id: "r", type: "rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 2, y: 1 } })).toHaveLength(4);
    expect(entityPointHandles(infline)).toEqual([]);
    expect(sketchPointHandles([line]).at(-1)?.role).toBe("origin");
  });

  it("entityRefPoint: центр окружности 0, обод 1, середина отрезка 2", () => {
    expect(entityRefPoint(circle, 0)).toEqual({ x: 100, y: 50 });
    expect(entityRefPoint(circle, 1)).toEqual({ x: 120, y: 50 });
    expect(entityRefPoint(line, LINE_MIDPOINT)).toEqual({ x: 30, y: 10 });
    expect(entityRefPoint(line, 3)).toBeNull();
  });
});
