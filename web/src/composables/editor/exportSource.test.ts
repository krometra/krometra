import { describe, expect, it } from "vitest";
import { exportBodyIdsOf, exportFilename, requestedExportBodyIds } from "./exportSource";
import type { ComponentEntry } from "./useDocumentModel";

const browser = (id: string, visible = true): ComponentEntry => ({ id, visible, source: { kind: "browser_extrude" } });
const server = (id: string, visible = true): ComponentEntry => ({ id, visible, source: { kind: "extrude" } });

describe("exportBodyIdsOf", () => {
  it("exports all visible browser bodies, skipping consumed ones", () => {
    expect(exportBodyIdsOf([browser("a", false), browser("b"), browser("c")])).toEqual(["b", "c"]);
  });

  it("ignores hidden server bodies", () => {
    expect(exportBodyIdsOf([server("a", false), browser("b")])).toEqual(["b"]);
  });

  it("rejects visible server bodies and empty scenes", () => {
    expect(() => exportBodyIdsOf([server("a"), browser("b")])).toThrow("серверного ядра");
    expect(() => exportBodyIdsOf([browser("a", false)])).toThrow("нет видимых тел");
  });
});

describe("requestedExportBodyIds", () => {
  const bodies = [browser("a", false), browser("b"), browser("c"), server("old", false)];

  it("берёт ровно названные тела в порядке запроса, скрытые тоже", () => {
    expect(requestedExportBodyIds(bodies, ["c", "a"])).toEqual(["c", "a"]);
  });

  it("повтор тела в запросе не удваивает его в файле", () => {
    expect(requestedExportBodyIds(bodies, ["b", "b", "c"])).toEqual(["b", "c"]);
  });

  it("называет тела, которых нет в документе", () => {
    expect(() => requestedExportBodyIds(bodies, ["b", "ghost", "x"])).toThrow("ghost, x");
  });

  it("отклоняет тело серверного ядра и пустой список", () => {
    expect(() => requestedExportBodyIds(bodies, ["b", "old"])).toThrow("серверного ядра");
    expect(() => requestedExportBodyIds(bodies, [])).toThrow("список тел пуст");
  });
});

describe("exportFilename", () => {
  it("экспорт всей модели называется по проекту, как у кнопки в интерфейсе", () => {
    expect(exportFilename("Болт M10", "step", null)).toBe("Болт M10.step");
  });

  it("экспорт выбранных тел добавляет их имена, чтобы файлы не затирали друг друга", () => {
    expect(exportFilename("Болт M10", "stl", ["Тело 3"])).toBe("Болт M10-Тело 3.stl");
    expect(exportFilename("Набор", "stl", ["Крышка", "Банка"])).toBe("Набор-Крышка+Банка.stl");
  });

  it("убирает символы, недопустимые в имени файла", () => {
    expect(exportFilename("a/b:c", "stl", ['Тело "1"', "x\\y"])).toBe("a_b_c-Тело _1_+x_y.stl");
  });
});
