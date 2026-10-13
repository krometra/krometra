import { describe, expect, it } from "vitest";
import { ApiError, errorMessage, toApiError } from "./apiError";

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
