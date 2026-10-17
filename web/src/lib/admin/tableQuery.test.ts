import { describe, expect, it } from "vitest";
import { applySearch, applySort, listQuery, offsetOf, type TableState } from "./tableQuery";

type Sort = "email" | "created_at";
const state: TableState<Sort> = { sort: "created_at", order: "desc", page: 3, pageSize: 25, q: "" };

describe("tableQuery", () => {
  it("переводит страницу в смещение", () => {
    expect(offsetOf(1, 25)).toBe(0);
    expect(offsetOf(3, 25)).toBe(50);
    expect(offsetOf(0, 25)).toBe(0);
  });

  it("собирает параметры запроса и пропускает пустой поиск", () => {
    expect(listQuery(state)).toBe("limit=25&offset=50&sort=created_at&order=desc");
    expect(listQuery({ ...state, q: "  ann " })).toContain("q=ann");
  });

  it("не просит больше 200 строк", () => {
    expect(listQuery({ ...state, page: 1, pageSize: 1000 })).toContain("limit=200");
  });

  it("сортирует только по разрешённым полям и сбрасывает страницу", () => {
    expect(applySort(state, "email", "asc", ["email", "created_at"])).toMatchObject({ sort: "email", order: "asc", page: 1 });
    expect(applySort(state, "password_hash", "asc", ["email", "created_at"])).toBe(state);
  });

  it("поиск возвращает на первую страницу", () => {
    expect(applySearch(state, "bob")).toMatchObject({ q: "bob", page: 1 });
  });
});
