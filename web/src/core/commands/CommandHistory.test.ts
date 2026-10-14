import { describe, it, expect, beforeEach } from "vitest";
import { CommandHistory } from "./CommandHistory";
import type { Command } from "./Command";

/** Команда-протокол: пишет порядок вызовов в общий лог. */
function makeCommand(label: string, log: string[], opts: { failUndo?: boolean } = {}): Command {
  return {
    label,
    async execute() {
      log.push(`do:${label}`);
    },
    async undo() {
      if (opts.failUndo) throw new Error(`undo ${label} failed`);
      log.push(`undo:${label}`);
    },
  };
}

let log: string[];
let history: CommandHistory;

beforeEach(() => {
  log = [];
  history = new CommandHistory();
});

describe("CommandHistory", () => {
  it("пустая история ничего не умеет", () => {
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("выполняет команду и разрешает отмену", async () => {
    await history.execute(makeCommand("A", log));

    expect(log).toEqual(["do:A"]);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("отменяет в обратном порядке", async () => {
    await history.execute(makeCommand("A", log));
    await history.execute(makeCommand("B", log));
    await history.undo();
    await history.undo();

    expect(log).toEqual(["do:A", "do:B", "undo:B", "undo:A"]);
    expect(history.canUndo).toBe(false);
  });

  it("повтор выполняет команду заново", async () => {
    await history.execute(makeCommand("A", log));
    await history.undo();
    await history.redo();

    expect(log).toEqual(["do:A", "undo:A", "do:A"]);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("новая команда после отмены обрывает ветку повтора", async () => {
    await history.execute(makeCommand("A", log));
    await history.undo();
    expect(history.canRedo).toBe(true);

    await history.execute(makeCommand("B", log));

    // Иначе redo вернул бы операцию из отброшенной ветки истории.
    expect(history.canRedo).toBe(false);
  });

  it("отмена на пустом стеке безопасна", async () => {
    await history.undo();
    await history.redo();
    expect(log).toEqual([]);
  });

  it("многократные отмена и повтор согласованы", async () => {
    await history.execute(makeCommand("A", log));
    await history.execute(makeCommand("B", log));
    await history.execute(makeCommand("C", log));

    await history.undo();
    await history.undo();
    await history.redo();

    expect(log).toEqual(["do:A", "do:B", "do:C", "undo:C", "undo:B", "do:B"]);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);
  });

  it("повтор возможен только до вершины стека", async () => {
    await history.execute(makeCommand("A", log));
    await history.undo();
    await history.redo();
    await history.redo();

    expect(log).toEqual(["do:A", "undo:A", "do:A"]);
  });

  it("упавшая отмена не проглатывается молча и оставляет команду в истории", async () => {
    await history.execute(makeCommand("A", log, { failUndo: true }));
    await expect(history.undo()).rejects.toThrow("undo A failed");
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("возвращает отменённую и повторённую команду", async () => {
    const command = makeCommand("A", log);
    await history.execute(command);
    expect(await history.undo()).toBe(command);
    expect(await history.redo()).toBe(command);
    expect(await history.redo()).toBeNull();
  });
});
