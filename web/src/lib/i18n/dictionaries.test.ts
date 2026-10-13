import { describe, expect, it } from "vitest";
import indexHtml from "../../../index.html?raw";
import { loadDictionary } from "./catalog";
import { parityIssues, pluralFormIssues } from "./dictionaryIssues";
import { LOCALES, SOURCE_LOCALE, type Locale } from "./locale";
import type { Dictionary, Message } from "./message";
import { translate } from "./translate";

const PRODUCT_NAME_KEY = "common.productName";

async function collectIssues(check: (locale: Locale, dictionary: Dictionary) => string[]): Promise<string[]> {
  const perLocale = await Promise.all(
    LOCALES.map(async (locale) => check(locale, await loadDictionary(locale))),
  );
  return perLocale.flat();
}

function texts(message: Message): string[] {
  return typeof message === "string" ? [message] : Object.values(message);
}

function emptyTextIssues(locale: Locale, dictionary: Dictionary): string[] {
  return Object.entries(dictionary)
    .filter(([, message]) => texts(message).some((text) => text.trim() === ""))
    .map(([key]) => `[${locale}] "${key}": пустой перевод`);
}

function hardcodedProductNameIssues(locale: Locale, dictionary: Dictionary): string[] {
  const productName = String(dictionary[PRODUCT_NAME_KEY]);
  return Object.entries(dictionary)
    .filter(([key, message]) => key !== PRODUCT_NAME_KEY && texts(message).some((text) => text.includes(productName)))
    .map(([key]) => `[${locale}] "${key}": название продукта вписано строкой, нужен параметр и ${PRODUCT_NAME_KEY}`);
}

describe("словари интерфейса", () => {
  it("во всех словарях тот же набор ключей и параметров, что в исходном", async () => {
    const source = { locale: SOURCE_LOCALE, dictionary: await loadDictionary(SOURCE_LOCALE) };
    const issues = await collectIssues((locale, dictionary) =>
      locale === SOURCE_LOCALE ? [] : parityIssues(source, { locale, dictionary }),
    );

    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("у форм множественного числа есть все категории своей локали", async () => {
    const issues = await collectIssues(pluralFormIssues);

    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("нет пустых переводов", async () => {
    const issues = await collectIssues(emptyTextIssues);

    expect(issues, issues.join("\n")).toEqual([]);
  });
});

describe("название продукта", () => {
  it("живёт в одном ключе, остальные сообщения получают его параметром", async () => {
    const issues = await collectIssues(hardcodedProductNameIssues);

    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("пишется кириллицей в русском и латиницей в английском и китайском", async () => {
    expect((await loadDictionary("ru"))[PRODUCT_NAME_KEY]).toBe("Крометра");
    expect((await loadDictionary("en"))[PRODUCT_NAME_KEY]).toBe("Krometra");
    expect((await loadDictionary("zh"))[PRODUCT_NAME_KEY]).toBe("Krometra");
  });

  it("русский заголовок вкладки совпадает с <title> в index.html", async () => {
    const catalog = { ru: await loadDictionary("ru") };
    const staticTitle = /<title>(.*)<\/title>/.exec(indexHtml)?.[1];

    const title = translate(catalog, "ru", "common.documentTitle", {
      product: translate(catalog, "ru", PRODUCT_NAME_KEY),
    });

    expect(title).toBe(staticTitle);
  });
});
