import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ToolError } from "../errors.mjs";
import {
  MAX_LABELS,
  collectAnchors,
  formatLegend,
  labelMetrics,
  layoutLabels,
  normalizeProjection,
  planLabels,
  sameProjection,
  toImagePoints,
} from "../labels.mjs";
import { readPngSize } from "../png.mjs";

const IMAGE = { width: 800, height: 600 };
const RECT = { left: 100, top: 50, width: 400, height: 300 };
const METRICS = labelMetrics(1);
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("точки привязки подписей", () => {
  test("ребро привязывается к midpoint и несёт концы start и end в легенду", () => {
    const arc = {
      id: "e-arc",
      start: [10, 0, 0],
      end: [-10, 0, 0],
      midpoint: [0, 10, 0],
      length: 31.4159,
      closed: false,
    };
    assert.deepEqual(collectAnchors({ edges: [arc] }, "edges").anchors, [
      { id: "e-arc", point: [0, 10, 0], details: { start: [10, 0, 0], end: [-10, 0, 0] } },
    ]);
  });

  test("ребро без midpoint привязывается к середине между концами, в том числе заданными как a и b", () => {
    const { anchors, unplaced } = collectAnchors(
      { edges: [{ id: "e-1", a: [0, 0, 0], b: [10, 4, 2.00004] }] },
      "edges",
    );
    assert.deepEqual(anchors, [{ id: "e-1", point: [5, 2, 1], details: { a: [0, 0, 0], b: [10, 4, 2] } }]);
    assert.deepEqual(unplaced, []);
  });

  test("грань привязывается к точке на грани, затем к центроиду, затем к центру bbox", () => {
    const faces = [
      { id: "f-1", point: [1, 2, 3], centroid: [9, 9, 9], normal: [0, 0, 1] },
      { id: "f-2", point: null, centroid: [4, 5, 6], normal: null },
      { id: "f-3", bbox: { min: [0, 0, 0], max: [10, 20, 30] } },
    ];
    assert.deepEqual(collectAnchors({ faces }, "faces").anchors, [
      { id: "f-1", point: [1, 2, 3], details: { point: [1, 2, 3], normal: [0, 0, 1] } },
      { id: "f-2", point: [4, 5, 6], details: { point: [4, 5, 6] } },
      { id: "f-3", point: [5, 10, 15], details: { point: [5, 10, 15] } },
    ]);
  });

  test("элементы без координат перечисляются в unplaced", () => {
    const edges = [
      { id: "e-1", start: [0, 0, 0], end: [1, 1, 1] },
      { id: "e-2", start: [0, 0] },
    ];
    assert.deepEqual(collectAnchors({ edges }, "edges").unplaced, ["e-2"]);
  });

  test("если ни у одного элемента нет точки привязки, ошибка показывает пример элемента", () => {
    assert.throws(
      () => collectAnchors({ faces: [{ id: "f-1", area: 12 }] }, "faces"),
      (error) => {
        assert.ok(error instanceof ToolError);
        assert.match(error.message, /"area":12/);
        return true;
      },
    );
  });

  test("ответ topology без нужного списка называет имеющиеся ключи", () => {
    assert.throws(() => collectAnchors({ bodyId: "b", faces: [] }, "edges"), /ключи ответа: bodyId, faces/);
  });
});

describe("проекция на снимок", () => {
  test("точки страницы и прямоугольник канваса принимаются в форме канала", () => {
    const reply = { points: [{ x: 120, y: 80, behind: false, inside: true }], canvas: RECT };
    assert.deepEqual(normalizeProjection(reply, 1), { rect: RECT, points: [{ x: 120, y: 80 }] });
  });

  test("точки за камерой и без координат становятся null", () => {
    const reply = { points: [null, { x: 3, y: 4, behind: true }, { x: Number.NaN, y: 4 }], canvas: RECT };
    assert.deepEqual(normalizeProjection(reply, 3).points, [null, null, null]);
  });

  test("ответ не по форме отклоняется с выдержкой из ответа", () => {
    const point = { x: 1, y: 2 };
    assert.throws(() => normalizeProjection({ points: [point] }, 1), ToolError);
    assert.throws(() => normalizeProjection({ points: [point], canvas: { ...RECT, width: 0 } }, 1), ToolError);
    assert.throws(() => normalizeProjection({ points: [point], canvas: RECT }, 2), /"points":\[\{"x":1,"y":2\}\]/);
  });

  test("координаты страницы переводятся в пиксели снимка с учётом смещения и плотности", () => {
    const projection = {
      rect: RECT,
      points: [{ x: 100, y: 50 }, { x: 300, y: 200 }, { x: 99, y: 60 }, { x: 500, y: 60 }, null],
    };
    assert.deepEqual(toImagePoints(projection, IMAGE), [{ x: 0, y: 0 }, { x: 400, y: 300 }, null, null, null]);
  });

  test("проекции совпадают в пределах полпикселя и различаются при сдвиге камеры", () => {
    const base = { rect: RECT, points: [{ x: 10, y: 10 }, null] };
    assert.equal(sameProjection(base, { rect: RECT, points: [{ x: 10.4, y: 9.6 }, null] }), true);
    assert.equal(sameProjection(base, { rect: RECT, points: [{ x: 12, y: 10 }, null] }), false);
    assert.equal(
      sameProjection(base, {
        rect: RECT,
        points: [
          { x: 10, y: 10 },
          { x: 1, y: 1 },
        ],
      }),
      false,
    );
    assert.equal(sameProjection(base, { rect: { ...RECT, left: 140 }, points: base.points }), false);
  });
});

describe("раскладка подписей", () => {
  test("подписи совпавших точек не перекрывают друг друга и не закрывают точки", () => {
    const anchor = { x: 400, y: 300 };
    const marks = layoutLabels(
      [
        { text: "e-aaaaaaaaaa", anchor },
        { text: "e-bbbbbbbbbb", anchor },
        { text: "e-cccccccccc", anchor },
      ],
      IMAGE,
      METRICS,
    );
    const boxes = marks.map((mark) => mark.box);
    boxes.forEach((box, index) => {
      for (const other of boxes.slice(index + 1)) assert.equal(overlap(box, other), false);
      assert.equal(overlap(box, { x: anchor.x - 1, y: anchor.y - 1, width: 2, height: 2 }), false);
    });
  });

  test("подпись у края остаётся внутри снимка", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 799, y: 0 },
      { x: 0, y: 599 },
      { x: 799, y: 599 },
    ];
    for (const { box } of layoutLabels(
      corners.map((anchor) => ({ text: "e-1234567890", anchor })),
      IMAGE,
      METRICS,
    )) {
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= IMAGE.width && box.y + box.height <= IMAGE.height);
    }
  });

  test("подпись шире снимка прижимается к его краю", () => {
    const [{ box }] = layoutLabels([{ text: "x".repeat(400), anchor: { x: 400, y: 300 } }], IMAGE, METRICS);
    assert.equal(box.x, 0);
  });

  test("размер подписи растёт с плотностью пикселей снимка", () => {
    assert.equal(labelMetrics(2).fontSize, labelMetrics(1).fontSize * 2);
  });
});

describe("план и легенда", () => {
  const anchors = [
    { id: "e-in", point: [0, 0, 0], details: { a: [0, 0, 0], b: [1, 0, 0] } },
    { id: "e-out", point: [9, 9, 9], details: { a: [9, 9, 9], b: [9, 9, 8] } },
  ];
  const projection = {
    rect: RECT,
    points: [
      { x: 300, y: 200 },
      { x: 5000, y: 200 },
    ],
  };

  test("объекты за кадром не подписываются и считаются в offscreen", () => {
    const plan = planLabels({ anchors, projection, image: IMAGE, labelText: "id" });
    assert.deepEqual(
      plan.marks.map((mark) => mark.text),
      ["e-in"],
    );
    assert.equal(plan.offscreen, 1);
    assert.equal(plan.truncated, 0);
  });

  test("подписей не больше лимита, остаток считается в truncated", () => {
    const many = Array.from({ length: MAX_LABELS + 7 }, (_, index) => ({
      id: `e-${index}`,
      point: [index, 0, 0],
      details: {},
    }));
    const crowded = { rect: RECT, points: many.map((_, index) => ({ x: 101 + index, y: 60 })) };
    const plan = planLabels({ anchors: many, projection: crowded, image: IMAGE, labelText: "number" });
    assert.equal(plan.marks.length, MAX_LABELS);
    assert.equal(plan.truncated, 7);
    assert.equal(plan.marks.at(-1).text, String(MAX_LABELS));
  });

  test("легенда - валидный JSON: id, координаты в мм и пиксель метки", () => {
    const plan = planLabels({ anchors, projection, image: IMAGE, labelText: "number" });
    const legend = JSON.parse(
      formatLegend({ bodyId: "body-1", kind: "edges", image: IMAGE, plan, unplaced: ["e-bad"], stable: false }),
    );
    assert.deepEqual(legend.items, [{ label: "1", id: "e-in", a: [0, 0, 0], b: [1, 0, 0], at: [400, 300] }]);
    assert.deepEqual(legend.unplaced, ["e-bad"]);
    assert.equal(legend.offscreen, 1);
    assert.match(legend.notes[0], /камера двигалась/);
  });

  test("в режиме id метка совпадает с id и в легенде не дублируется", () => {
    const plan = planLabels({ anchors, projection, image: IMAGE, labelText: "id" });
    const legend = JSON.parse(
      formatLegend({ bodyId: "body-1", kind: "edges", image: IMAGE, plan, unplaced: [], stable: true }),
    );
    assert.equal("label" in legend.items[0], false);
    assert.equal(legend.notes, undefined);
  });
});

describe("размер PNG", () => {
  test("читается из заголовка без декодирования", () => {
    assert.deepEqual(readPngSize(ONE_PIXEL_PNG), { width: 1, height: 1 });
  });

  test("не PNG - null", () => {
    assert.equal(readPngSize(Buffer.from("JFIF not a png at all, really").toString("base64")), null);
    assert.equal(readPngSize(""), null);
  });
});
