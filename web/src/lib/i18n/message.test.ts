import { describe, expect, it } from "vitest";
import {
  interpolate,
  placeholderNames,
  pluralCategories,
  renderMessage,
  selectPluralForm,
} from "./message";

describe("interpolate", () => {
  it("подставляет параметры по имени", () => {
    expect(interpolate("{name}: {count} шт.", { name: "Болт", count: 4 })).toBe("Болт: 4 шт.");
  });

  it("подставляет повторяющийся параметр во все места", () => {
    expect(interpolate("{n} из {n}", { n: 3 })).toBe("3 из 3");
  });

  it("оставляет неизвестный параметр видимым", () => {
    expect(interpolate("Привет, {name}!", {})).toBe("Привет, {name}!");
    expect(interpolate("Привет, {name}!")).toBe("Привет, {name}!");
  });

  it("не подставляет унаследованные свойства объекта", () => {
    expect(interpolate("{toString}", {})).toBe("{toString}");
  });

  it("подставляет ноль и пустую строку", () => {
    expect(interpolate("[{a}][{b}]", { a: 0, b: "" })).toBe("[0][]");
  });
});

describe("placeholderNames", () => {
  it("возвращает имена параметров без повторов", () => {
    expect(placeholderNames("{a} и {b}, снова {a}")).toEqual(["a", "b"]);
    expect(placeholderNames("без параметров")).toEqual([]);
  });
});

describe("selectPluralForm", () => {
  const ru = { one: "тело", few: "тела", many: "тел", other: "тела" };

  it("выбирает русскую форму по правилам локали", () => {
    expect(selectPluralForm("ru", ru, 1)).toBe("тело");
    expect(selectPluralForm("ru", ru, 3)).toBe("тела");
    expect(selectPluralForm("ru", ru, 5)).toBe("тел");
    expect(selectPluralForm("ru", ru, 11)).toBe("тел");
    expect(selectPluralForm("ru", ru, 21)).toBe("тело");
    expect(selectPluralForm("ru", ru, 1.5)).toBe("тела");
  });

  it("выбирает английскую форму", () => {
    const en = { one: "body", other: "bodies" };
    expect(selectPluralForm("en", en, 1)).toBe("body");
    expect(selectPluralForm("en", en, 0)).toBe("bodies");
    expect(selectPluralForm("en", en, 21)).toBe("bodies");
  });

  it("в китайском форма одна", () => {
    expect(selectPluralForm("zh", { other: "个实体" }, 1)).toBe("个实体");
    expect(selectPluralForm("zh", { other: "个实体" }, 7)).toBe("个实体");
  });

  it("берёт other, если нужной формы нет", () => {
    expect(selectPluralForm("ru", { other: "штук" }, 1)).toBe("штук");
  });
});

describe("pluralCategories", () => {
  it("возвращает категории, которые требует локаль", () => {
    expect(pluralCategories("ru").sort()).toEqual(["few", "many", "one", "other"]);
    expect(pluralCategories("en").sort()).toEqual(["one", "other"]);
    expect(pluralCategories("zh")).toEqual(["other"]);
  });
});

describe("renderMessage", () => {
  it("рендерит строку с параметрами", () => {
    expect(renderMessage("ru", "Проект «{name}»", { name: "Кронштейн" })).toBe("Проект «Кронштейн»");
  });

  it("выбирает форму по count и подставляет его", () => {
    const forms = { one: "{count} грань", few: "{count} грани", many: "{count} граней", other: "{count} грани" };
    expect(renderMessage("ru", forms, { count: 1 })).toBe("1 грань");
    expect(renderMessage("ru", forms, { count: 22 })).toBe("22 грани");
    expect(renderMessage("ru", forms, { count: 100 })).toBe("100 граней");
  });

  it("без count берёт форму other", () => {
    expect(renderMessage("en", { one: "one item", other: "many items" })).toBe("many items");
  });
});
