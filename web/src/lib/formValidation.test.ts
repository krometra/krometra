import { describe, expect, it } from "vitest";
import {
  validateConsent,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
  validatePasswordEntered,
} from "./formValidation";
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

describe("validatePasswordConfirmation", () => {
  it("требует повтор пароля", () => {
    expect(inRussian(validatePasswordConfirmation("secret-123", ""))).toBe("Повторите пароль.");
  });

  it("ловит несовпадение", () => {
    expect(inRussian(validatePasswordConfirmation("secret-123", "secret-124"))).toBe("Пароли не совпадают.");
  });

  it("принимает совпадающий повтор", () => {
    expect(validatePasswordConfirmation("secret-123", "secret-123")).toBeNull();
  });
});

describe("validateConsent", () => {
  it("без согласия не пускает дальше", () => {
    expect(inRussian(validateConsent(false))).toBe("Без согласия на обработку персональных данных создать аккаунт нельзя.");
  });

  it("с согласием ошибки нет", () => {
    expect(validateConsent(true)).toBeNull();
  });
});
