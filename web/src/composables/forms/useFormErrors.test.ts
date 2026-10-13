import { afterEach, describe, expect, it, vi } from "vitest";

async function setup() {
  vi.resetModules();
  const { useI18n } = await import("@/composables/shared/useI18n");
  const { useFormErrors } = await import("./useFormErrors");
  const { ApiError } = await import("@/lib/apiError");
  const { msg } = await import("@/lib/i18n/catalog");
  vi.stubGlobal("document", { documentElement: { lang: "" } });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  return { i18n: useI18n(), errors: useFormErrors(msg("auth.login.failed")), ApiError, msg };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFormErrors", () => {
  it("форма без замечаний проходит проверку", async () => {
    const { errors } = await setup();

    expect(errors.validate({ email: null, password: null })).toBe(true);
    expect(errors.fields.value).toEqual({});
    expect(errors.summary.value).toBe("");
  });

  it("собирает замечания по полям и переводит их", async () => {
    const { errors, msg } = await setup();

    const valid = errors.validate({ email: msg("validation.email.required"), password: null });

    expect(valid).toBe(false);
    expect(errors.fields.value).toEqual({ email: "Введите адрес почты." });
  });

  it("переводит уже показанные замечания при смене языка", async () => {
    const { errors, i18n, msg } = await setup();
    errors.validate({ password: msg("validation.password.tooShort", { count: 8 }) });

    await i18n.setLocale("en");

    expect(errors.fields.value).toEqual({
      password: "The password must be at least 8 characters long.",
    });
  });

  it("clearField снимает замечание только с одного поля", async () => {
    const { errors, msg } = await setup();
    errors.validate({
      email: msg("validation.email.required"),
      password: msg("validation.password.required"),
    });

    errors.clearField("email");

    expect(errors.fields.value).toEqual({ password: "Введите пароль." });
  });

  it("показывает ошибки полей от сервера без общей ошибки", async () => {
    const { errors, ApiError } = await setup();

    errors.capture(new ApiError(422, "validation_error", "Пароль: минимум 8 символов.", {
      password: "Пароль: минимум 8 символов.",
    }));

    expect(errors.fields.value).toEqual({ password: "Пароль: минимум 8 символов." });
    expect(errors.summary.value).toBe("");

    errors.clearField("password");
    expect(errors.fields.value).toEqual({});
  });

  it("ошибку сервера без полей показывает общей строкой", async () => {
    const { errors, ApiError } = await setup();

    errors.capture(new ApiError(400, "invalid_grant", "Неверная почта или пароль."));

    expect(errors.summary.value).toBe("Неверная почта или пароль.");
    expect(errors.fields.value).toEqual({});
  });

  it("неизвестную ошибку заменяет запасным текстом на текущем языке", async () => {
    const { errors, i18n } = await setup();

    errors.capture(null);
    expect(errors.summary.value).toBe("Не удалось войти.");

    await i18n.setLocale("en");
    expect(errors.summary.value).toBe("Could not sign in.");
  });

  it("новая проверка сбрасывает прошлые ошибки", async () => {
    const { errors, ApiError } = await setup();
    errors.capture(new ApiError(400, "invalid_grant", "Неверная почта или пароль."));

    expect(errors.validate({ email: null })).toBe(true);

    expect(errors.summary.value).toBe("");
  });
});
