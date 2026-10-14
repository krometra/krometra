import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BOARD_LEVELS,
  BOTTOM,
  CAMERA,
  CAMERA_HOLDER_LEVELS,
  PCB,
  TOP,
  cameraCutSketch,
  entityEnds,
  pcbHoles,
  pcbSketch,
  roundedOutline,
} from "./support/maixcam.mjs";

const TOLERANCE = 1e-9;
const samePoint = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < TOLERANCE;

function insideOutline(x, y, margin) {
  return x - margin > 0 && x + margin < PCB.length && y - margin > 0 && y + margin < PCB.width;
}

function overlaps([ax1, ax2], [ay1, ay2], cx, cy, radius) {
  const dx = Math.max(ax1 - cx, 0, cx - ax2);
  const dy = Math.max(ay1 - cy, 0, cy - ay2);
  return Math.hypot(dx, dy) < radius;
}

describe("сценарий MaixCAM для e2e MCP", () => {
  test("контур платы из line и arc замкнут: конец каждой сущности - начало следующей", () => {
    const outline = roundedOutline(PCB.length, PCB.width, PCB.cornerR);
    assert.deepEqual(
      outline.map((entity) => entity.type),
      ["line", "arc", "line", "arc", "line", "arc", "line", "arc"],
    );
    outline.forEach((entity, index) => {
      const [, end] = entityEnds(entity);
      const [start] = entityEnds(outline[(index + 1) % outline.length]);
      assert.ok(samePoint(end, start), `разрыв после сущности ${index}`);
    });
  });

  test("дуги идут против часовой стрелки по четверти окружности", () => {
    for (const entity of roundedOutline(PCB.length, PCB.width, PCB.cornerR).filter((item) => item.type === "arc")) {
      assert.ok(Math.abs(entity.endAngle - entity.startAngle - Math.PI / 2) < TOLERANCE);
    }
  });

  test("отверстия внутри контура и не задеты компонентами, которые выдавливаются от Z = 0", () => {
    const holes = pcbHoles();
    assert.equal(holes.length, PCB.pinRowsY.length * PCB.pinIndexes.length + PCB.mountHoles.length);
    for (const hole of holes) {
      const { x, y } = hole.center;
      assert.ok(insideOutline(x, y, hole.radius), `отверстие ${x},${y} выходит за контур`);
      for (const part of [...TOP, BOTTOM]) {
        assert.ok(!overlaps(part.x, part.y, x, y, hole.radius), `${part.name} закрывает отверстие ${x},${y}`);
      }
    }
    assert.equal(pcbSketch().length, 8 + holes.length);
  });

  test("стойки камеры внутри платы модуля, срез шире платы модуля", () => {
    for (const [x, y] of CAMERA.posts) {
      assert.ok(x - CAMERA.postR > CAMERA.boardX[0] && x + CAMERA.postR < CAMERA.boardX[1]);
      assert.ok(y - CAMERA.postR > CAMERA.boardY[0] && y + CAMERA.postR < CAMERA.boardY[1]);
    }
    const [outer, ...posts] = cameraCutSketch();
    assert.equal(outer.type, "rectangle");
    assert.ok(outer.corner1.x < CAMERA.boardX[0] && outer.corner2.x > CAMERA.boardX[1]);
    assert.ok(outer.corner1.y < CAMERA.boardY[0] && outer.corner2.y > CAMERA.boardY[1]);
    assert.equal(posts.length, 2);
    assert.ok(CAMERA.holderX[0] >= CAMERA.boardX[0] && CAMERA.holderX[1] <= CAMERA.boardX[1]);
    assert.ok(CAMERA.holderY[0] >= CAMERA.boardY[0] && CAMERA.holderY[1] <= CAMERA.boardY[1]);
  });

  test("ожидаемые уровни Z отсортированы и без повторов", () => {
    for (const levels of [BOARD_LEVELS, CAMERA_HOLDER_LEVELS]) {
      assert.deepEqual(levels, [...new Set(levels)].sort((a, b) => a - b));
    }
    assert.equal(BOARD_LEVELS[0], -BOTTOM.depth);
    assert.ok(Math.abs(CAMERA_HOLDER_LEVELS.at(-1) - 11.05) < TOLERANCE);
  });
});
