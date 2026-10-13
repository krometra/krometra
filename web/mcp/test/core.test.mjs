import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { errorHint, isReply, unwrap } from "../channel.mjs";
import { loadConfig, missingCredentials } from "../config.mjs";
import { ToolError, createRedactor } from "../errors.mjs";

describe("конфигурация из окружения", () => {
  test("значения по умолчанию: локальный dev-сервер, headless Chromium", () => {
    assert.deepEqual(loadConfig({}), {
      baseUrl: "http://localhost:5173",
      email: "",
      password: "",
      headless: true,
      browserChannel: "chromium",
      readyTimeoutMs: 60_000,
      requestTimeoutMs: 120_000,
    });
  });

  test("адрес без завершающего слэша, видимый браузер, свой канал и таймауты", () => {
    const config = loadConfig({
      CAD_STUDIO_URL: "http://localhost:5180/",
      CAD_STUDIO_HEADLESS: "false",
      CAD_STUDIO_BROWSER_CHANNEL: "chrome",
      CAD_STUDIO_READY_TIMEOUT_MS: "90000",
      CAD_STUDIO_REQUEST_TIMEOUT_MS: "много",
    });
    assert.equal(config.baseUrl, "http://localhost:5180");
    assert.equal(config.headless, false);
    assert.equal(config.browserChannel, "chrome");
    assert.equal(config.readyTimeoutMs, 90_000);
    assert.equal(config.requestTimeoutMs, 120_000);
  });

  test("видимый режим включается значениями 0, false, no, off", () => {
    for (const value of ["0", "false", "NO", " off "])
      assert.equal(loadConfig({ CAD_STUDIO_HEADLESS: value }).headless, false, value);
    for (const value of ["1", "true", ""])
      assert.equal(loadConfig({ CAD_STUDIO_HEADLESS: value }).headless, true, value);
  });

  test("недостающие учётные данные называются по именам переменных", () => {
    assert.deepEqual(missingCredentials(loadConfig({ CAD_STUDIO_EMAIL: "a@b.c" })), ["CAD_STUDIO_PASSWORD"]);
    assert.deepEqual(
      missingCredentials(loadConfig({ CAD_STUDIO_EMAIL: "a@b.c", CAD_STUDIO_PASSWORD: "secret-pass" })),
      [],
    );
  });
});

describe("скрытие секретов", () => {
  test("известные секреты и JWT заменяются маской", () => {
    const redactor = createRedactor();
    redactor.add("stub-pass-123");
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl";
    assert.equal(redactor.redact(`pw=stub-pass-123 auth=Bearer ${jwt}`), "pw=*** auth=Bearer ***");
  });

  test("слишком короткое значение не маскируется, чтобы не портить вывод", () => {
    const redactor = createRedactor();
    redactor.add("12");
    assert.equal(redactor.redact("радиус 12 мм"), "радиус 12 мм");
  });
});

describe("ответ канала", () => {
  test("контрактный ответ распознаётся, посторонние значения - нет", () => {
    assert.equal(isReply({ ok: true, op: "state", result: {} }), true);
    assert.equal(isReply({ ok: false, op: "x", error: { code: "busy", message: "m" } }), true);
    for (const value of [null, "ok", {}, { ok: "yes" }, { ok: false }]) assert.equal(isReply(value), false);
  });

  test("успешный ответ разворачивается в result", () => {
    assert.deepEqual(unwrap({ ok: true, op: "state", result: { busy: false } }), { busy: false });
  });

  test("ошибка канала превращается в ToolError с кодом, сообщением и подсказкой", () => {
    const reply = { ok: false, op: "fillet", error: { code: "busy", message: "идёт выдавливание" } };
    assert.throws(
      () => unwrap(reply),
      (error) => {
        assert.ok(error instanceof ToolError);
        assert.match(error.message, /^fillet: busy - идёт выдавливание\n.*повтори вызов/);
        return true;
      },
    );
    assert.equal(errorHint({ error: { code: "something_new" } }), "");
  });
});
