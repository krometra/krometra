import { describe, it, expect } from "vitest";
import { toApiError } from "./apiError";

// Исходники backend читаем через vite-глоб: он резолвится сборщиком, поэтому
// тесту не нужны @types/node (их в проекте нет, а vue-tsc проверяет и тесты).
const backendSources = import.meta.glob("../../../backend/app/**/*.py", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Коды ошибок, которые backend реально возвращает клиенту. */
function backendErrorCodes(): Set<string> {
  const codes = new Set<string>();
  for (const src of Object.values(backendSources)) {
    for (const m of src.matchAll(/"error":\s*"([a-z_]+)"/g)) codes.add(m[1]);
    // Коды через хелперы: `_bad_request("code", …)`, `_error("code", …)` и `_fail(status, "code", …)`.
    // Без этого гейт не видел целые семейства ошибок (up_to_face_*,
    // stale_target_body, invalid_extrude_params) — они уходили бы к
    // пользователю английским текстом, а тест оставался зелёным.
    for (const m of src.matchAll(/_(?:bad_request|error)\(\s*"([a-z_]+)"/g)) codes.add(m[1]);
    for (const m of src.matchAll(/_fail\(\s*[^,]+,\s*"([a-z_]+)"/g)) codes.add(m[1]);
    // edge_ops собирает код из kind: f"{kind}_failed" для fillet и chamfer
    for (const m of src.matchAll(/"error":\s*f"\{kind\}_([a-z]+)"/g)) {
      codes.add(`fillet_${m[1]}`);
      codes.add(`chamfer_${m[1]}`);
    }
  }
  return codes;
}

/**
 * Гейт против возврата к «Сервер не смог выполнить операцию. Попробуйте ещё
 * раз» (ROADMAP, чек-лист UI: «Тост об ошибке ничего не объясняет»).
 *
 * Новый код ошибки на backend без русского текста здесь — красный тест, а не
 * молча непонятный тост у пользователя.
 */
describe("покрытие кодов ошибок backend", () => {
  const GENERIC = [
    "Сервер не смог выполнить операцию. Попробуйте ещё раз.",
    "Запрос отклонён сервером.",
    "Что-то пошло не так.",
  ];

  // Коды протокола OAuth/валидации: их пользователь видит в формах входа,
  // где текст задаётся отдельно, либо они не доходят до UI.
  const NOT_USER_FACING = new Set(["invalid_client", "server_error", "access_denied"]);

  it("каждый код backend имеет осмысленный русский текст", () => {
    const missing: string[] = [];
    for (const code of backendErrorCodes()) {
      if (NOT_USER_FACING.has(code)) continue;
      // Сервер прислал код без описания — худший случай, проверяем именно его.
      const err = toApiError(500, { detail: { error: code } }, "Что-то пошло не так.");
      if (GENERIC.includes(err.message)) missing.push(code);
    }
    expect(
      missing,
      `Коды без русского текста — добавь их в CODE_MESSAGES (web/src/lib/apiError.ts): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("сообщения не пустые и не английские заглушки", () => {
    for (const code of backendErrorCodes()) {
      if (NOT_USER_FACING.has(code)) continue;
      const err = toApiError(400, { detail: { error: code } }, "fallback");
      expect(err.message.length, code).toBeGreaterThan(10);
      expect(err.message, code).toMatch(/[а-яА-ЯёЁ]/);
    }
  });

  it("описание сервера с деталями побеждает общий перевод", () => {
    // У скругления сервер считает максимальный радиус — это ценнее общей фразы.
    const err = toApiError(
      400,
      {
        detail: {
          error: "fillet_failed",
          error_description: "Радиус 5 мм слишком велик, максимум для этих рёбер — 2.4 мм.",
        },
      },
      "fallback",
    );
    expect(err.message).toContain("2.4");
  });

  it("код без описания подставляет общий перевод, а не пустоту", () => {
    const err = toApiError(400, { detail: { error: "stale_target_body" } }, "fallback");
    expect(err.message).toContain("устарело");
  });
});
