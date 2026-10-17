import { describe, expect, it } from "vitest";
import { formatAuthMethods, formatCount, formatDate, formatDay, formatRelative, formatStorage } from "./format";

describe("admin format", () => {
  it("показывает объём в человеческих единицах", () => {
    expect(formatStorage(512)).toBe("512 Б");
    expect(formatStorage(3 * 1024 * 1024)).toBe("3.0 МБ");
    expect(formatStorage(2.5 * 1024 ** 3)).toBe("2.5 ГБ");
  });

  it("разделяет разряды числа", () => {
    expect(formatCount(12345).replace(/\s/g, " ")).toBe("12 345");
  });

  it("пустая дата - прочерк", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatRelative(undefined)).toBe("—");
  });

  it("день ряда не сдвигается часовым поясом", () => {
    expect(formatDay("2026-10-01")).toMatch(/^1 окт/);
  });

  it("недавние даты - относительно сегодня", () => {
    const now = new Date(2026, 9, 17, 15);
    expect(formatRelative(new Date(2026, 9, 17, 9).toISOString(), now)).toBe("сегодня");
    expect(formatRelative(new Date(2026, 9, 16, 23).toISOString(), now)).toBe("вчера");
    expect(formatRelative(new Date(2026, 9, 12, 12).toISOString(), now)).toBe("5 дней назад");
    expect(formatRelative(new Date(2026, 5, 1, 12).toISOString(), now)).toMatch(/2026/);
  });

  it("переводит способы входа", () => {
    expect(formatAuthMethods(["password", "yandex"])).toBe("Пароль, Яндекс");
    expect(formatAuthMethods([])).toBe("—");
  });
});
