import { describe, expect, it } from "vitest";
import { translate, type Catalog } from "./translate";

const catalog: Catalog = {
  ru: {
    "greeting": "Привет, {name}!",
    "only.ru": "Только по-русски",
    "bodies": { one: "{count} тело", few: "{count} тела", many: "{count} тел", other: "{count} тела" },
    "only.ru.plural": { one: "{count} эскиз", few: "{count} эскиза", many: "{count} эскизов", other: "{count} эскиза" },
  },
  en: {
    "greeting": "Hello, {name}!",
    "bodies": { one: "{count} body", other: "{count} bodies" },
  },
};

describe("translate", () => {
  it("берёт сообщение из словаря текущей локали", () => {
    expect(translate(catalog, "en", "greeting", { name: "Nia" })).toBe("Hello, Nia!");
    expect(translate(catalog, "ru", "greeting", { name: "Ниа" })).toBe("Привет, Ниа!");
  });

  it("склоняет по правилам текущей локали", () => {
    expect(translate(catalog, "en", "bodies", { count: 1 })).toBe("1 body");
    expect(translate(catalog, "en", "bodies", { count: 2 })).toBe("2 bodies");
    expect(translate(catalog, "ru", "bodies", { count: 2 })).toBe("2 тела");
  });

  it("при отсутствии ключа откатывается на русский", () => {
    expect(translate(catalog, "en", "only.ru")).toBe("Только по-русски");
  });

  it("при откате склоняет по правилам русского, а не запрошенной локали", () => {
    expect(translate(catalog, "en", "only.ru.plural", { count: 3 })).toBe("3 эскиза");
    expect(translate(catalog, "en", "only.ru.plural", { count: 5 })).toBe("5 эскизов");
  });

  it("откатывается на русский, пока словарь локали не загружен", () => {
    expect(translate(catalog, "zh", "greeting", { name: "Ниа" })).toBe("Привет, Ниа!");
  });

  it("возвращает сам ключ, если его нет ни в одном словаре", () => {
    expect(translate(catalog, "en", "missing.key")).toBe("missing.key");
    expect(translate({}, "ru", "missing.key")).toBe("missing.key");
  });

  it("не принимает унаследованные свойства объекта за сообщение", () => {
    expect(translate(catalog, "ru", "constructor")).toBe("constructor");
    expect(translate(catalog, "ru", "toString")).toBe("toString");
  });
});
