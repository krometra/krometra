import { describe, expect, expectTypeOf, it } from "vitest";
import { SOURCE_CATALOG, loadDictionary, msg, type MessageKey, type MessageKeyArgs } from "./catalog";
import { ru } from "./dictionaries/ru";
import { LOCALES } from "./locale";
import { translate } from "./translate";

describe("loadDictionary", () => {
  it.each(LOCALES)("загружает словарь %s", async (locale) => {
    const dictionary = await loadDictionary(locale);
    expect(Object.keys(dictionary).length).toBeGreaterThan(0);
  });

  it("исходный словарь доступен без загрузки", async () => {
    expect(SOURCE_CATALOG.ru).toBe(ru);
    expect(await loadDictionary("ru")).toBe(ru);
  });

  it("перевод из загруженного словаря отличается от исходного", async () => {
    const catalog = { ...SOURCE_CATALOG, en: await loadDictionary("en"), zh: await loadDictionary("zh") };
    expect(translate(catalog, "en", "auth.login.submit")).toBe("Continue");
    expect(translate(catalog, "zh", "auth.login.submit")).toBe("继续");
  });
});

describe("msg", () => {
  it("описывает сообщение без параметров", () => {
    expect(msg("validation.email.required")).toEqual({ key: "validation.email.required" });
  });

  it("описывает сообщение с параметрами", () => {
    expect(msg("validation.password.tooShort", { count: 8 })).toEqual({
      key: "validation.password.tooShort",
      values: { count: 8 },
    });
  });
});

describe("типизация ключей", () => {
  it("опечатка в ключе не является ключом словаря", () => {
    expectTypeOf<"auth.login.title">().toMatchTypeOf<MessageKey>();
    expectTypeOf<"auth.login.titel">().not.toMatchTypeOf<MessageKey>();
  });

  it("сообщение без параметров не принимает аргументов", () => {
    expectTypeOf<MessageKeyArgs<"auth.login.title">>().toEqualTypeOf<[]>();
  });

  it("форма множественного числа требует числовой count", () => {
    expectTypeOf<MessageKeyArgs<"validation.password.tooShort">>().toEqualTypeOf<
      [values: { readonly count: number } & Readonly<Record<never, string | number>>]
    >();
  });
});
