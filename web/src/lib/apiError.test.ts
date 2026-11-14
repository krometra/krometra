import { describe, expect, it } from "vitest";
import { ApiError, errorMessage, toApiError } from "./apiError";
import { errors as english } from "./i18n/dictionaries/en/errors";
import { errors as chinese } from "./i18n/dictionaries/zh/errors";
import { renderMessage } from "./i18n/message";

describe("toApiError", () => {
  it("разворачивает валидацию FastAPI в поля формы", () => {
    const err = toApiError(422, {
      detail: [
        { loc: ["body", "email"], msg: "value is not a valid email address", type: "value_error" },
        { loc: ["body", "password"], msg: "String should have at least 8 characters", type: "too_short" },
      ],
    }, "fallback");

    expect(err.fields["email"]).toBe("Введите корректный адрес почты.");
    expect(err.fields["password"]).toBe("Пароль: минимум 8 символов.");
    expect(err.message).toBe("Введите корректный адрес почты.");
  });

  it("показывает текст ValueError из валидатора без префикса pydantic", () => {
    const err = toApiError(422, {
      detail: [{ loc: ["body", "password"], msg: "Value error, Пароль длиннее 72 байт в UTF-8.", type: "value_error" }],
    }, "fallback");

    expect(err.fields["password"]).toBe("Пароль длиннее 72 байт в UTF-8.");
  });

  it("переводит известный код ошибки, игнорируя английский текст сервера", () => {
    const err = toApiError(400, {
      detail: { error: "invalid_grant", error_description: "Invalid credentials." },
    }, "fallback");

    expect(err.message).toBe("Неверная почта или пароль.");
    expect(err.code).toBe("invalid_grant");
  });

  it("применяет перевод к известному коду и сохраняет описание неизвестного", () => {
    const translate = () => "Incorrect email or password.";
    expect(toApiError(400, { error: "invalid_grant" }, "fallback", translate).message)
      .toBe("Incorrect email or password.");
    expect(toApiError(400, { error: "custom_error", error_description: "Details" }, "fallback", translate).message)
      .toBe("Details");
  });

  it("локализует геометрические ошибки и ошибки проверки полей", () => {
    const en = (key: keyof typeof english, values?: Record<string, string | number>) =>
      renderMessage("en", english[key], values);
    const zh = (key: keyof typeof chinese, values?: Record<string, string | number>) =>
      renderMessage("zh", chinese[key], values);
    expect(toApiError(400, { error: "fillet_failed" }, "fallback", en).message)
      .toContain("fillet");
    expect(toApiError(422, { detail: [{ loc: ["body", "password"], msg: "String should have at least 8 characters" }] }, "fallback", zh).fields.password)
      .toBe("密码：至少需要 8 个字符。");
    expect(toApiError(503, null, "fallback", en).message).toContain("unavailable");
  });

  it("оставляет текст сервера для незнакомого кода", () => {
    const err = toApiError(400, {
      detail: { error: "extrude_failed", error_description: "Расстояние не может быть нулевым." },
    }, "fallback");

    expect(err.message).toBe("Расстояние не может быть нулевым.");
  });

  it("строковый detail показывается как есть", () => {
    expect(toApiError(404, { detail: "Project not found" }, "fallback").message).toBe("Project not found");
  });

  it("пустое тело ответа маппится по HTTP-статусу", () => {
    expect(toApiError(500, null, "fallback").message).toBe(
      "Сервер не смог выполнить операцию. Попробуйте ещё раз.",
    );
  });

  it("совместим с чтением через error_description", () => {
    const err = toApiError(403, {}, "fallback");
    expect(err.error_description).toBe(err.message);
  });
});

describe("errorMessage", () => {
  it("достаёт текст из ApiError", () => {
    expect(errorMessage(new ApiError(0, "network_error", "Нет связи."))).toBe("Нет связи.");
  });

  it("падает на запасной текст для неизвестного значения", () => {
    expect(errorMessage({}, "запасной")).toBe("запасной");
  });
});
