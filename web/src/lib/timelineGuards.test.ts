import { describe, expect, it } from "vitest";
import {
  SKETCH_OPEN_REASON,
  entryDeleteBlock,
  historyLockReason,
  isOpenSketch,
  isOpenSketchEntry,
  lockItems,
  sketchDeleteBlock,
  type HistoryLockState,
} from "./timelineGuards";

const model: HistoryLockState = { sketchOpen: false, activeSketchId: null };
const editing: HistoryLockState = { sketchOpen: true, activeSketchId: "s1" };
const drafting: HistoryLockState = { sketchOpen: true, activeSketchId: "sketch-new" };

describe("historyLockReason", () => {
  it("в режиме модели история открыта", () => {
    expect(historyLockReason(model)).toBeNull();
  });

  it("правка существующего и новый эскиз запирают историю", () => {
    expect(historyLockReason(editing)).toBe(SKETCH_OPEN_REASON);
    expect(historyLockReason(drafting)).toBe(SKETCH_OPEN_REASON);
  });
});

describe("isOpenSketch", () => {
  it("узнаёт только открытый эскиз", () => {
    expect(isOpenSketch(editing, "s1")).toBe(true);
    expect(isOpenSketch(editing, "s2")).toBe(false);
    expect(isOpenSketch(editing, null)).toBe(false);
    expect(isOpenSketch({ sketchOpen: false, activeSketchId: "s1" }, "s1")).toBe(false);
  });

  it("запись истории открытого эскиза — только запись kind sketch", () => {
    expect(isOpenSketchEntry(editing, { kind: "sketch", sketch_id: "s1" })).toBe(true);
    expect(isOpenSketchEntry(editing, { kind: "extrude", sketch_id: "s1" })).toBe(false);
    expect(isOpenSketchEntry(editing, { kind: "sketch", sketch_id: "s2" })).toBe(false);
  });
});

describe("удаление в открытом эскизе", () => {
  it("текущий эскиз удалять можно, остальное нельзя", () => {
    expect(sketchDeleteBlock(editing, "s1")).toBeNull();
    expect(sketchDeleteBlock(editing, "s2")).toBe(SKETCH_OPEN_REASON);
    expect(entryDeleteBlock(editing, { kind: "sketch", sketch_id: "s1" })).toBeNull();
    expect(entryDeleteBlock(editing, { kind: "extrude", sketch_id: "s1" })).toBe(SKETCH_OPEN_REASON);
  });

  it("новый эскиз не открывает удаление чужих записей", () => {
    expect(entryDeleteBlock(drafting, { kind: "sketch", sketch_id: "s1" })).toBe(SKETCH_OPEN_REASON);
  });

  it("в режиме модели удаление ничем не ограничено", () => {
    expect(sketchDeleteBlock(model, "s1")).toBeNull();
    expect(entryDeleteBlock(model, { kind: "extrude" })).toBeNull();
  });
});

describe("lockItems", () => {
  const items = [{ label: "Скрыть" }, { label: "Удалить", editsModel: true }];

  it("без причины пункты не меняются", () => {
    expect(lockItems(items, null)).toBe(items);
  });

  it("правки модели становятся disabled с подсказкой, просмотр остаётся", () => {
    expect(lockItems(items, SKETCH_OPEN_REASON)).toEqual([
      { label: "Скрыть" },
      { label: "Удалить", editsModel: true, disabled: true, hint: SKETCH_OPEN_REASON },
    ]);
  });
});
