import { describe, expect, it } from "vitest";
import { validateEmail, validatePassword, validatePasswordEntered } from "./formValidation";
import { SOURCE_CATALOG, type MessageDescriptor } from "./i18n/catalog";
import { translate } from "./i18n/translate";

function inRussian(message: MessageDescriptor | null): string | null {
  return message && translate(SOURCE_CATALOG, "ru", message.key, message.values);
}

describe("validateEmail", () => {
  it("требует адрес", () => {
    expect(inRussian(validateEmail("   "))).toBe("Введите адрес почты.");
  });

  it("ловит опечатку в адресе", () => {
    expect(inRussian(validateEmail("engineer@company"))).toBe("Похоже на опечатку — проверьте адрес почты.");
  });

  it("принимает корректный адрес с пробелами по краям", () => {
    expect(validateEmail(" engineer@company.ru ")).toBeNull();
  });
});

describe("validatePasswordEntered", () => {
  it("требует пароль, но не проверяет длину", () => {
    expect(inRussian(validatePasswordEntered(""))).toBe("Введите пароль.");
    expect(validatePasswordEntered("1")).toBeNull();
  });
});

describe("validatePassword", () => {
  it("требует пароль", () => {
    expect(inRussian(validatePassword(""))).toBe("Введите пароль.");
  });

  it("называет минимальную длину", () => {
    expect(inRussian(validatePassword("1234567"))).toBe("Пароль должен быть не короче 8 символов.");
  });

  it("принимает пароль минимальной длины", () => {
    expect(validatePassword("12345678")).toBeNull();
  });
});
