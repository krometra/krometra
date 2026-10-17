import { describe, it, expect } from "vitest";
import type { SketchEntity } from "@/types/api";
import {
  collectCandidates,
  entityCandidates,
  intersectionCandidates,
  pickCandidate,
  snapAt,
  SNAP_LABELS,
  type SnapKind,
} from "./snapCandidates";
import { niceGridSpacing } from "./gridSpacing";

const line = (
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  construction = false,
): SketchEntity =>
  ({
    id,
    type: "line",
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    construction,
  }) as SketchEntity;

const rect = (id: string, x1: number, y1: number, x2: number, y2: number): SketchEntity =>
  ({ id, type: "rectangle", corner1: { x: x1, y: y1 }, corner2: { x: x2, y: y2 } }) as SketchEntity;

const circle = (id: string, cx: number, cy: number, r: number): SketchEntity =>
  ({ id, type: "circle", center: { x: cx, y: cy }, radius: r }) as SketchEntity;

const arc = (id: string, cx: number, cy: number, r: number, a1: number, a2: number): SketchEntity =>
  ({ id, type: "arc", center: { x: cx, y: cy }, radius: r, startAngle: a1, endAngle: a2 }) as SketchEntity;

const has = (candidates: { point: { x: number; y: number }; kind: SnapKind }[], x: number, y: number, kind?: SnapKind) =>
  candidates.some(
    (c) =>
      Math.abs(c.point.x - x) < 1e-6 &&
      Math.abs(c.point.y - y) < 1e-6 &&
      (kind === undefined || c.kind === kind),
  );

describe("точки примитивов", () => {
  it("отрезок даёт оба конца и середину", () => {
    const got = entityCandidates(line("l", 0, 0, 10, 0));
    expect(has(got, 0, 0, "endpoint")).toBe(true);
    expect(has(got, 10, 0, "endpoint")).toBe(true);
    expect(has(got, 5, 0, "midpoint")).toBe(true);
  });

  it("линия построения тоже даёт концы — иначе угол грани не ловится", () => {
    // Контур грани приходит construction-линиями (useSketchLifecycle),
    // и раньше их концы не попадали в кандидаты.
    const got = entityCandidates(line("c", 0, 0, 10, 0, true));
    expect(has(got, 0, 0, "endpoint")).toBe(true);
    expect(has(got, 10, 0, "endpoint")).toBe(true);
  });

  it("прямоугольник даёт 4 угла, 4 середины сторон и центр", () => {
    const got = entityCandidates(rect("r", 0, 0, 10, 6));

    for (const [x, y] of [[0, 0], [10, 6], [10, 0], [0, 6]]) {
      expect(has(got, x, y, "endpoint"), `угол ${x},${y}`).toBe(true);
    }
    for (const [x, y] of [[5, 0], [10, 3], [5, 6], [0, 3]]) {
      expect(has(got, x, y, "midpoint"), `середина ${x},${y}`).toBe(true);
    }
    expect(has(got, 5, 3, "center")).toBe(true);
  });

  it("окружность даёт центр и четыре квадранта", () => {
    const got = entityCandidates(circle("c", 0, 0, 5));
    expect(has(got, 0, 0, "center")).toBe(true);
    expect(has(got, 5, 0, "quadrant")).toBe(true);
    expect(has(got, -5, 0, "quadrant")).toBe(true);
    expect(has(got, 0, 5, "quadrant")).toBe(true);
    expect(has(got, 0, -5, "quadrant")).toBe(true);
  });

  it("дуга даёт центр и оба конца", () => {
    const got = entityCandidates(arc("a", 0, 0, 10, 0, Math.PI / 2));
    expect(has(got, 0, 0, "center")).toBe(true);
    expect(has(got, 10, 0, "endpoint")).toBe(true);
    expect(has(got, 0, 10, "endpoint")).toBe(true);
  });
});

describe("пересечения прямых", () => {
  it("вспомогательная × вспомогательная", () => {
    const got = intersectionCandidates([line("a", 0, 0, 10, 0, true), line("b", 5, -5, 5, 5, true)]);
    expect(has(got, 5, 0, "intersection")).toBe(true);
  });

  it("вспомогательная × обычная сторона", () => {
    const got = intersectionCandidates([line("a", 0, 0, 10, 0, true), line("b", 3, -5, 3, 5)]);
    expect(has(got, 3, 0, "intersection")).toBe(true);
  });

  it("сторона × сторона", () => {
    const got = intersectionCandidates([line("a", 0, 0, 10, 0), line("b", 7, -5, 7, 5)]);
    expect(has(got, 7, 0, "intersection")).toBe(true);
  });

  it("параллельные прямые пересечения не дают", () => {
    expect(intersectionCandidates([line("a", 0, 0, 10, 0), line("b", 0, 4, 10, 4)])).toEqual([]);
  });

  it("пересечение считается по бесконечной прямой, а не только по отрезку", () => {
    // Продолжения линий — законная точка привязки в CAD.
    const got = intersectionCandidates([line("a", 0, 0, 2, 0), line("b", 9, 1, 9, 5)]);
    expect(has(got, 9, 0, "intersection")).toBe(true);
  });
});

describe("выбор победителя", () => {
  const candidates = () => collectCandidates([rect("r", 0, 0, 10, 10), circle("c", 0, 0, 3)]);

  it("ближайший кандидат в пределах порога", () => {
    const got = pickCandidate(candidates(), { x: 9.8, y: 9.9 }, 1);
    expect(got?.point).toEqual({ x: 10, y: 10 });
  });

  it("за порогом привязки нет", () => {
    expect(pickCandidate(candidates(), { x: 50, y: 50 }, 1)).toBeNull();
  });

  it("точка примитива важнее пересечения в той же точке", () => {
    // Угол прямоугольника и пересечение его сторон совпадают: побеждает угол.
    const got = pickCandidate(candidates(), { x: 0.01, y: 0.01 }, 1);
    expect(got?.kind === "endpoint" || got?.kind === "center").toBe(true);
  });

  it("середина проигрывает концу при равном расстоянии", () => {
    const both = [
      { point: { x: 0, y: 0 }, kind: "midpoint" as SnapKind, label: "Середина" },
      { point: { x: 0, y: 0 }, kind: "endpoint" as SnapKind, label: "Конец" },
    ];
    expect(pickCandidate(both, { x: 0, y: 0 }, 1)?.kind).toBe("endpoint");
  });

  it("выбор устойчив: тот же курсор даёт тот же кандидат", () => {
    const cursor = { x: 0.2, y: 0.2 };
    const first = pickCandidate(candidates(), cursor, 1);
    const second = pickCandidate(candidates(), cursor, 1);
    expect(first).toEqual(second);
  });

  it("у каждого типа есть человеческая подпись", () => {
    for (const c of candidates()) {
      expect(c.label).toBe(SNAP_LABELS[c.kind]);
      expect(c.label.length).toBeGreaterThan(2);
    }
  });
});

describe("snapAt", () => {
  it("возвращает угол прямоугольника с типом «Конец»", () => {
    const got = snapAt([rect("r", 0, 0, 10, 10)], { x: 9.9, y: 10.05 }, 0.5);
    expect(got?.point).toEqual({ x: 10, y: 10 });
    expect(got?.label).toBe("Конец");
  });

  it("центр окружности ловится по типу «Центр»", () => {
    const got = snapAt([circle("c", 4, 4, 3)], { x: 4.05, y: 3.95 }, 0.5);
    expect(got?.kind).toBe("center");
    expect(got?.point).toEqual({ x: 4, y: 4 });
  });

  it("угол грани из линий построения ловится (репро жалобы)", () => {
    // Грань куба приходит четырьмя construction-линиями: их общий конец —
    // тот самый угол, который «не ловился» при эскизе на грани.
    const face = [
      line("f0", 0, 0, 20, 0, true),
      line("f1", 20, 0, 20, 20, true),
      line("f2", 20, 20, 0, 20, true),
      line("f3", 0, 20, 0, 0, true),
    ];
    const got = snapAt(face, { x: 19.9, y: 0.1 }, 0.5);
    expect(got?.point).toEqual({ x: 20, y: 0 });
    expect(got?.kind).toBe("endpoint");
  });

  it("центр круглого торца ловится (окружность построения)", () => {
    // Торец втулки приходит construction-окружностью: её центр — привязка.
    const face = [
      { id: "fc0", type: "circle", center: { x: 0, y: 0 }, radius: 10, construction: true },
      { id: "fc1", type: "circle", center: { x: 0, y: 0 }, radius: 4, construction: true },
    ] as SketchEntity[];
    const got = snapAt(face, { x: 0.1, y: -0.1 }, 0.5);
    expect(got?.kind).toBe("center");
    expect(got?.point).toEqual({ x: 0, y: 0 });
  });

  it("вдали от точек падает на проекцию «На линии»", () => {
    // Не середина и не конец — там настоящих точек нет, остаётся проекция.
    const got = snapAt([line("l", 0, 0, 100, 0)], { x: 31, y: 0.2 }, 0.5);
    expect(got?.kind).toBe("on-line");
    expect(got?.point.y).toBeCloseTo(0, 6);
    expect(got?.point.x).toBeCloseTo(31, 6);
  });

  it("проекция не перебивает настоящую точку рядом", () => {
    const got = snapAt([line("l", 0, 0, 100, 0)], { x: 0.1, y: 0.1 }, 1);
    expect(got?.kind).toBe("endpoint");
  });

  it("пустой эскиз не даёт привязки", () => {
    expect(snapAt([], { x: 1, y: 1 }, 1)).toBeNull();
  });

  it("вырожденный отрезок не ломает расчёт", () => {
    const got = snapAt([line("l", 5, 5, 5, 5)], { x: 5, y: 5 }, 1);
    expect(got?.point).toEqual({ x: 5, y: 5 });
  });

  it("привязывает к ближайшему видимому узлу сетки с собственной подписью", () => {
    const spacing = niceGridSpacing(2);
    expect(spacing).toBe(20);
    const got = snapAt([], { x: -19.4, y: 39.7 }, 1, spacing);
    expect(got).toEqual({ point: { x: -20, y: 40 }, kind: "grid", label: "Сетка" });
  });

  it("не притягивает к сетке за пределами экранного порога", () => {
    expect(snapAt([], { x: 9, y: 9 }, 1, 20)).toBeNull();
  });

  it("радиус маленькой окружности не схлопывается в узел сетки под центром", () => {
    expect(snapAt([], { x: 3, y: 0 }, 5, 20, { x: 0, y: 0 })).toBeNull();
  });

  it("конец, пересечение и середина выигрывают у совпавшего узла сетки", () => {
    const cases = [
      { entities: [line("end", 20, 20, 100, 20)], cursor: { x: 20.1, y: 20.1 }, kind: "endpoint" },
      {
        entities: [line("a", 0, 20, 40, 20), line("b", 20, 0, 20, 40)],
        cursor: { x: 20.1, y: 20.1 },
        kind: "intersection",
      },
      { entities: [line("mid", 0, 20, 40, 20)], cursor: { x: 20.1, y: 20.1 }, kind: "midpoint" },
    ];
    for (const { entities, cursor, kind } of cases) {
      expect(snapAt(entities, cursor, 1, 20)?.kind).toBe(kind);
    }
  });

  it("проекция на линию выигрывает у более близкого узла сетки", () => {
    const got = snapAt([line("l", -100, 20.5, 100, 20.5)], { x: 20, y: 20 }, 1, 20);
    expect(got?.kind).toBe("on-line");
  });

  it("вторая точка окружности у стороны берёт перпендикуляр из центра", () => {
    const got = snapAt(
      [line("side", 0, 0, 0, 100)],
      { x: 0.5, y: 40.2 },
      1,
      20,
      { x: 50, y: 40 },
    );
    expect(got).toEqual({ point: { x: 0, y: 40 }, kind: "perpendicular", label: "Перпендикуляр" });
  });

  it("не прыгает к далёкому перпендикуляру при наведении на другую точку стороны", () => {
    const got = snapAt(
      [line("side", 0, 0, 0, 100)],
      { x: 0.5, y: 25 },
      1,
      20,
      { x: 50, y: 50 },
    );
    expect(got?.kind).toBe("on-line");
    expect(got?.point.y).toBeCloseTo(25);
  });

  it("перпендикуляр не продолжается за концы стороны", () => {
    const got = snapAt([line("side", 0, 0, 0, 10)], { x: 0.2, y: 3 }, 1, 20, { x: 50, y: 50 });
    expect(got?.kind).toBe("on-line");
  });
});

describe("начало координат", () => {
  it("ловится привязкой в пустом эскизе", () => {
    expect(snapAt([], { x: 0.2, y: -0.1 }, 0.5)).toMatchObject({ kind: "origin", point: { x: 0, y: 0 }, label: "Начало координат" });
  });

  it("конец отрезка в начале координат важнее", () => {
    expect(snapAt([line("l", 0, 0, 10, 0)], { x: 0.1, y: 0.1 }, 1)?.kind).toBe("endpoint");
  });
});

describe("источник привязки для авто-ограничений", () => {
  it("точка примитива знает свой объект и номер точки, как в решателе", () => {
    const arc: SketchEntity = { id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2 };
    expect(snapAt([line("l", 20, 20, 40, 20)], { x: 40.1, y: 20 }, 1)?.ref).toEqual({ entity_id: "l", sub_index: 1 });
    expect(snapAt([line("l", 20, 20, 40, 20)], { x: 30, y: 20.1 }, 1)).toMatchObject({ kind: "midpoint", ref: { entity_id: "l", sub_index: 0 } });
    expect(snapAt([arc], { x: 0.1, y: 10 }, 1)?.ref).toEqual({ entity_id: "a", sub_index: 2 });
    expect(snapAt([], { x: 0.1, y: 0 }, 1)?.ref).toEqual({ entity_id: "sketch-origin", sub_index: 0 });
  });

  it("проекция на отрезок ссылается на него, пересечение - ни на что", () => {
    expect(snapAt([line("l", 20, 20, 40, 20)], { x: 25, y: 20.2 }, 1)).toMatchObject({ kind: "on-line", ref: { entity_id: "l", sub_index: 0 } });
    expect(intersectionCandidates([line("a", 0, 0, 10, 0), line("b", 5, -5, 5, 5)])[0].ref).toBeUndefined();
  });
});
