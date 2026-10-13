import { describe, expect, it } from "vitest";
import { LOCALES, LOCALE_HTML_LANG, LOCALE_NAMES, parseLocale, resolveInitialLocale } from "./locale";

describe("parseLocale", () => {
  it("принимает поддерживаемые локали", () => {
    expect(parseLocale("ru")).toBe("ru");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("zh")).toBe("zh");
  });

  it("сводит регион, регистр и пробелы к базовому языку", () => {
    expect(parseLocale("zh-CN")).toBe("zh");
    expect(parseLocale("en_US")).toBe("en");
    expect(parseLocale(" RU ")).toBe("ru");
  });

  it("отклоняет неизвестное и пустое значение", () => {
    expect(parseLocale("de")).toBeNull();
    expect(parseLocale("")).toBeNull();
    expect(parseLocale("constructor")).toBeNull();
    expect(parseLocale(null)).toBeNull();
    expect(parseLocale(undefined)).toBeNull();
  });
});

describe("resolveInitialLocale", () => {
  it("сохранённый выбор пользователя важнее env", () => {
    expect(resolveInitialLocale({ stored: "zh", envDefault: "en" })).toBe("zh");
  });

  it("без сохранённого выбора берёт язык из env", () => {
    expect(resolveInitialLocale({ stored: null, envDefault: "en" })).toBe("en");
  });

  it("испорченный сохранённый выбор не мешает env", () => {
    expect(resolveInitialLocale({ stored: "klingon", envDefault: "zh" })).toBe("zh");
  });

  it("неизвестное или пустое значение env даёт русский", () => {
    expect(resolveInitialLocale({ stored: null, envDefault: "de" })).toBe("ru");
    expect(resolveInitialLocale({ stored: null, envDefault: "" })).toBe("ru");
    expect(resolveInitialLocale({ stored: null, envDefault: undefined })).toBe("ru");
  });
});

describe("справочники локалей", () => {
  it("у каждой локали есть название и значение для атрибута lang", () => {
    for (const locale of LOCALES) {
      expect(LOCALE_NAMES[locale]).not.toBe("");
      expect(Intl.getCanonicalLocales(LOCALE_HTML_LANG[locale])).toHaveLength(1);
    }
  });
});
