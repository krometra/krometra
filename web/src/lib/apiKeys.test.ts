import { describe, expect, it } from "vitest";
import { API_KEY_LIMIT, API_KEY_NAME_MAX, isAtKeyLimit, validateKeyName, withoutSecret } from "./apiKeys";
import type { ApiKey } from "@/types/api";

function apiKey(id: string): ApiKey {
  return { id, name: id, prefix: "krm_abcdefgh", created_at: "2026-10-14T10:00:00Z", last_used_at: null };
}

describe("название ключа", () => {
  it("пустое и из пробелов не принимается", () => {
    expect(validateKeyName("")?.key).toBe("account.keys.name.required");
    expect(validateKeyName("   ")?.key).toBe("account.keys.name.required");
  });

  it("длиннее лимита backend не принимается, с числом в сообщении", () => {
    const issue = validateKeyName("x".repeat(API_KEY_NAME_MAX + 1));
    expect(issue).toEqual({ key: "account.keys.name.tooLong", values: { count: API_KEY_NAME_MAX } });
  });

  it("лимит считается по названию без пробелов по краям", () => {
    expect(validateKeyName(`  ${"x".repeat(API_KEY_NAME_MAX)}  `)).toBeNull();
  });
});

describe("созданный ключ", () => {
  it("в список попадает без самого ключа", () => {
    const listed = withoutSecret({ ...apiKey("k1"), key: "krm_secret" });
    expect(listed).toEqual(apiKey("k1"));
    expect(JSON.stringify(listed)).not.toContain("krm_secret");
  });
});

describe("лимит ключей", () => {
  it("достигается на десятом ключе", () => {
    const keys = Array.from({ length: API_KEY_LIMIT }, (_, index) => apiKey(`k${index}`));
    expect(isAtKeyLimit(keys.slice(1))).toBe(false);
    expect(isAtKeyLimit(keys)).toBe(true);
  });
});
