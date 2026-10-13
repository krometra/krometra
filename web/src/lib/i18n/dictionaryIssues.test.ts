import { describe, expect, it } from "vitest";
import { parityIssues, pluralFormIssues } from "./dictionaryIssues";

const source = {
  locale: "ru",
  dictionary: {
    "title": "Заголовок",
    "hello": "Привет, {name}!",
    "bodies": { one: "{count} тело", few: "{count} тела", many: "{count} тел", other: "{count} тела" },
  },
};

describe("parityIssues", () => {
  it("не находит замечаний у полного перевода", () => {
    const dictionary = {
      "title": "Title",
      "hello": "Hello, {name}!",
      "bodies": { one: "one body", other: "{count} bodies" },
    };
    expect(parityIssues(source, { locale: "en", dictionary })).toEqual([]);
  });

  it("называет недостающий ключ и словарь", () => {
    const dictionary = { "title": "Title", "bodies": { one: "{count} body", other: "{count} bodies" } };
    expect(parityIssues(source, { locale: "en", dictionary })).toEqual(['[en] нет ключа "hello"']);
  });

  it("называет лишний ключ", () => {
    const dictionary = { ...source.dictionary, "extra": "Лишнее" };
    expect(parityIssues(source, { locale: "zh", dictionary })).toEqual([
      '[zh] лишний ключ "extra", в ru его нет',
    ]);
  });

  it("называет расхождение в именах параметров", () => {
    const dictionary = { ...source.dictionary, "hello": "Hello, {username}!" };
    expect(parityIssues(source, { locale: "en", dictionary })).toEqual([
      '[en] "hello": параметры {username}, в ru {name}',
    ]);
  });

  it("замечает потерянный параметр", () => {
    const dictionary = { ...source.dictionary, "hello": "Hello!" };
    expect(parityIssues(source, { locale: "en", dictionary })).toEqual([
      '[en] "hello": параметры (нет), в ru {name}',
    ]);
  });

  it("замечает лишний параметр в одной из форм множественного числа", () => {
    const dictionary = { ...source.dictionary, "bodies": { one: "{count} body", other: "{count} bodies of {owner}" } };
    expect(parityIssues(source, { locale: "en", dictionary })).toEqual([
      '[en] "bodies": параметры {count}, {owner}, в ru {count}',
    ]);
  });

  it("замечает строку на месте форм множественного числа", () => {
    const dictionary = { ...source.dictionary, "bodies": "{count} bodies" };
    expect(parityIssues(source, { locale: "en", dictionary })).toEqual([
      '[en] "bodies": строка и формы множественного числа не совпадают с ru',
    ]);
  });
});

describe("pluralFormIssues", () => {
  it("не находит замечаний, когда формы совпадают с категориями локали", () => {
    expect(pluralFormIssues("ru", source.dictionary)).toEqual([]);
    expect(pluralFormIssues("en", { "bodies": { one: "body", other: "bodies" } })).toEqual([]);
    expect(pluralFormIssues("zh", { "bodies": { other: "个实体" } })).toEqual([]);
  });

  it("называет недостающую форму, ключ и словарь", () => {
    const dictionary = { "bodies": { one: "{count} тело", many: "{count} тел", other: "{count} тела" } };
    expect(pluralFormIssues("ru", dictionary)).toEqual(['[ru] "bodies": нет формы "few"']);
  });

  it("называет форму, которую локаль не использует", () => {
    const dictionary = { "bodies": { one: "body", few: "bodies", other: "bodies" } };
    expect(pluralFormIssues("en", dictionary)).toEqual([
      '[en] "bodies": лишняя форма "few", локаль её не использует',
    ]);
  });
});
