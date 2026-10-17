import { describe, expect, it } from "vitest";
import type { SketchEntity, SketchPoint } from "@/types/api";
import {
  AUTO_ANGLE_TOLERANCE,
  glyphsOf,
  materializeConstraints,
  ownAnchorsFor,
  planLineEnd,
  planPoint,
  type PlanOptions,
} from "./autoConstraints";
import { snapAt, type SnapCandidate } from "./snapCandidates";
import { SKETCH_ORIGIN_ID } from "./sketchOrigin";

const CURRENT = new Set(["horizontal", "vertical", "coincident", "parallel", "perpendicular", "equal"]);
const options = (supported: ReadonlySet<string> = CURRENT): PlanOptions => ({
  supported,
  angleTolerance: AUTO_ANGLE_TOLERANCE,
  minLength: 1,
});

const base: SketchEntity = { id: "base", type: "line", start: { x: 0, y: 0 }, end: { x: 30, y: 10 } };
const arc: SketchEntity = { id: "arc", type: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2 };

const snapOf = (entities: SketchEntity[], at: SketchPoint): SnapCandidate | null => snapAt(entities, at, 0.5);

function plan(start: SketchPoint, end: SketchPoint, entities: SketchEntity[] = [], supported?: ReadonlySet<string>) {
  const endSnap = snapOf(entities, end);
  return planLineEnd(
    { start, startSnap: snapOf(entities, start), end: endSnap?.point ?? end, endSnap, entities },
    options(supported),
  );
}

describe("planLineEnd: направление", () => {
  it("почти горизонтальная линия прилипает к горизонтали и обещает H", () => {
    const result = plan({ x: 5, y: 40 }, { x: 25, y: 41 });
    expect(result.end).toEqual({ x: 25, y: 40 });
    expect(result.constraints).toEqual([{ type: "horizontal", anchors: [{ own: "curve" }] }]);
    expect(glyphsOf(result.constraints)).toEqual(["H"]);
  });

  it("почти вертикальная прилипает к вертикали, в обратную сторону тоже", () => {
    const result = plan({ x: 5, y: 40 }, { x: 5.8, y: 10 });
    expect(result.end.x).toBeCloseTo(5, 9);
    expect(result.end.y).toBeCloseTo(10, 9);
    expect(result.constraints[0].type).toBe("vertical");
  });

  it("за порогом угла линия остаётся как есть и ничего не обещает", () => {
    const result = plan({ x: 5, y: 40 }, { x: 25, y: 44 });
    expect(result.end).toEqual({ x: 25, y: 44 });
    expect(result.constraints).toEqual([]);
  });

  it("слишком короткая линия не прилипает, чтобы маркер не дрожал у начала", () => {
    expect(plan({ x: 5, y: 40 }, { x: 5.5, y: 40.01 }).constraints).toEqual([]);
  });

  it("от конца отрезка: перпендикуляр к нему с прилипанием", () => {
    const along = { x: 30, y: 10 };
    const normal = { x: -10, y: 30 };
    const cursor = { x: 30 + normal.x * 0.5 + along.x * 0.03, y: 10 + normal.y * 0.5 + along.y * 0.03 };
    const result = plan({ x: 30, y: 10 }, cursor, [base]);
    expect(result.constraints).toEqual([
      { type: "perpendicular", anchors: [{ own: "curve" }, { other: { entity_id: "base", sub_index: 0 } }] },
    ]);
    const v = { x: result.end.x - 30, y: result.end.y - 10 };
    expect(v.x * along.x + v.y * along.y).toBeCloseTo(0, 9);
    expect(glyphsOf(result.constraints)).toEqual(["⊥"]);
  });

  it("от конца отрезка: продолжение вдоль него - параллельность", () => {
    const result = plan({ x: 30, y: 10 }, { x: 60, y: 20.6 }, [base]);
    expect(result.constraints.map((c) => c.type)).toEqual(["parallel"]);
    expect((result.end.y - 10) / (result.end.x - 30)).toBeCloseTo(1 / 3, 9);
  });

  it("горизонталь важнее перпендикуляра к горизонтальному отрезку", () => {
    const flat: SketchEntity = { id: "flat", type: "line", start: { x: 0, y: 0 }, end: { x: 20, y: 0 } };
    expect(plan({ x: 20, y: 0 }, { x: 20.5, y: 15 }, [flat]).constraints.map((c) => c.type)).toEqual(["vertical"]);
  });

  it("касание дуги не предлагается, пока решатель его не знает, и предлагается, когда знает", () => {
    const slanted: SketchEntity = { id: "arc", type: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: -Math.PI / 2, endAngle: Math.PI / 4 };
    const tip = { x: 10 * Math.SQRT1_2, y: 10 * Math.SQRT1_2 };
    const cursor = { x: tip.x - 10 + 0.3, y: tip.y + 10 + 0.3 };
    expect(plan(tip, cursor, [slanted]).constraints).toEqual([]);
    const withTangent = plan(tip, cursor, [slanted], new Set([...CURRENT, "tangent"]));
    expect(withTangent.constraints).toEqual([
      { type: "tangent", anchors: [{ own: "curve" }, { other: { entity_id: "arc", sub_index: 0 } }] },
    ]);
    const v = { x: withTangent.end.x - tip.x, y: withTangent.end.y - tip.y };
    expect(v.x + v.y).toBeCloseTo(0, 9);
  });
});

describe("planLineEnd: точка конца", () => {
  it("конец на конце отрезка - совпадение, точка не сдвигается", () => {
    const result = plan({ x: 50, y: 50 }, { x: 30.2, y: 10.1 }, [base]);
    expect(result.end).toEqual({ x: 30, y: 10 });
    expect(result.constraints).toEqual([
      { type: "coincident", anchors: [{ own: "end" }, { other: { entity_id: "base", sub_index: 1 } }] },
    ]);
  });

  it("конец на точке, выровненной по горизонтали, - ещё и H", () => {
    const result = plan({ x: 60, y: 10 }, { x: 30.2, y: 10.1 }, [base]);
    expect(result.constraints.map((c) => c.type)).toEqual(["horizontal", "coincident"]);
  });

  it("начало координат - совпадение с опорной точкой эскиза", () => {
    const result = plan({ x: 20, y: 30 }, { x: 0.1, y: 0.2 }, []);
    expect(result.constraints).toEqual([
      { type: "coincident", anchors: [{ own: "end" }, { other: { entity_id: SKETCH_ORIGIN_ID, sub_index: 0 } }] },
    ]);
  });

  it("середина отрезка даёт midpoint только если решатель его знает", () => {
    const at = { x: 15.1, y: 5 };
    expect(plan({ x: 0, y: 40 }, at, [base]).constraints).toEqual([]);
    const withMidpoint = plan({ x: 0, y: 40 }, at, [base], new Set([...CURRENT, "midpoint"]));
    expect(withMidpoint.constraints).toEqual([
      { type: "midpoint", anchors: [{ own: "end" }, { other: { entity_id: "base", sub_index: 0 } }] },
    ]);
  });
});

describe("planPoint", () => {
  it("центр окружности и конец дуги - совпадение с нужной точкой", () => {
    const circle: SketchEntity = { id: "c", type: "circle", center: { x: 40, y: 40 }, radius: 5 };
    expect(planPoint("start", snapOf([circle], { x: 40.1, y: 40 }), CURRENT)).toEqual([
      { type: "coincident", anchors: [{ own: "start" }, { other: { entity_id: "c", sub_index: 0 } }] },
    ]);
    expect(planPoint("start", snapOf([arc], { x: 0.1, y: 10 }), CURRENT)[0].anchors[1]).toEqual({
      other: { entity_id: "arc", sub_index: 2 },
    });
  });

  it("сетка и пересечение ограничений не дают", () => {
    expect(planPoint("end", { point: { x: 0, y: 0 }, kind: "grid", label: "Сетка" }, CURRENT)).toEqual([]);
    expect(planPoint("end", null, CURRENT)).toEqual([]);
  });
});

describe("materializeConstraints и ownAnchorsFor", () => {
  const line: SketchEntity = { id: "new", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
  let counter = 0;
  const makeId = () => `auto-${++counter}`;

  it("линия: начало 0, конец 1, сама линия 0", () => {
    const resolve = ownAnchorsFor("line", [line])!;
    const built = materializeConstraints(
      [
        { type: "horizontal", anchors: [{ own: "curve" }] },
        { type: "coincident", anchors: [{ own: "end" }, { other: { entity_id: "base", sub_index: 1 } }] },
      ],
      resolve,
      makeId,
    );
    expect(built).toEqual([
      { id: "auto-1", type: "horizontal", anchors: [{ entity_id: "new", sub_index: 0 }], value: null },
      {
        id: "auto-2",
        type: "coincident",
        anchors: [{ entity_id: "new", sub_index: 1 }, { entity_id: "base", sub_index: 1 }],
        value: null,
      },
    ]);
  });

  it("прямоугольник: первый угол - начало первой стороны, второй - начало третьей", () => {
    const sides = ["e0", "e1", "e2", "e3"].map((id) => ({ ...line, id }));
    const resolve = ownAnchorsFor("rectangle", sides)!;
    expect(resolve("start")).toEqual({ entity_id: "e0", sub_index: 0 });
    expect(resolve("end")).toEqual({ entity_id: "e2", sub_index: 0 });
    expect(resolve("curve")).toBeNull();
  });

  it("окружность: только центр; ограничение с неразрешённым якорем отбрасывается", () => {
    const circle: SketchEntity = { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 1 };
    const resolve = ownAnchorsFor("circle", [circle])!;
    const built = materializeConstraints(
      [
        { type: "coincident", anchors: [{ own: "start" }, { other: { entity_id: "o", sub_index: 0 } }] },
        { type: "coincident", anchors: [{ own: "end" }, { other: { entity_id: "o", sub_index: 1 } }] },
      ],
      resolve,
      makeId,
    );
    expect(built.map((c) => c.anchors[0])).toEqual([{ entity_id: "c", sub_index: 0 }]);
  });

  it("неизвестный инструмент своих ограничений не планирует", () => {
    expect(ownAnchorsFor("arc3", [line])).toBeNull();
    expect(ownAnchorsFor("line", [])).toBeNull();
  });
});
