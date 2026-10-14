import { describe, expect, it, vi } from "vitest";
import { useApiKeys, type ApiKeysClient } from "./useApiKeys";
import { ApiError } from "@/lib/apiError";
import type { ApiKey } from "@/types/api";

function apiKey(id: string): ApiKey {
  return { id, name: `ключ ${id}`, prefix: "krm_abcdefgh", created_at: "2026-10-14T10:00:00Z", last_used_at: null };
}

function fakeClient(overrides: Partial<Record<keyof ApiKeysClient, ReturnType<typeof vi.fn>>> = {}) {
  const client = {
    get: vi.fn(async () => ({ api_keys: [apiKey("old")] })),
    post: vi.fn(async (_path: string, body: { name: string }) => ({ ...apiKey("new"), name: body.name, key: "krm_secret" })),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
  return { client, keys: useApiKeys(client as unknown as ApiKeysClient) };
}

describe("useApiKeys", () => {
  it("загружает список ключей", async () => {
    const { client, keys } = fakeClient();
    await keys.load();
    expect(client.get).toHaveBeenCalledWith("/auth/api-keys/");
    expect(keys.keys.value.map((key) => key.id)).toEqual(["old"]);
    expect(keys.loading.value).toBe(false);
  });

  it("ошибку загрузки запоминает, а не бросает", async () => {
    const failure = new ApiError(500, "error", "boom");
    const { keys } = fakeClient({ get: vi.fn(async () => Promise.reject(failure)) });
    await keys.load();
    expect(keys.loadFailure.value).toBe(failure);
    expect(keys.loading.value).toBe(false);
  });

  it("созданный ключ показывается один раз, а в список идёт без секрета первым", async () => {
    const { client, keys } = fakeClient();
    await keys.load();
    await keys.create("  Claude Code  ");
    expect(client.post).toHaveBeenCalledWith("/auth/api-keys/", { name: "Claude Code" });
    expect(keys.revealed.value?.key).toBe("krm_secret");
    expect(keys.keys.value.map((key) => key.id)).toEqual(["new", "old"]);
    expect(JSON.stringify(keys.keys.value)).not.toContain("krm_secret");

    keys.dismissRevealed();
    expect(keys.revealed.value).toBeNull();
  });

  it("ошибка создания уходит вызывающему, список не меняется", async () => {
    const failure = new ApiError(409, "api_key_limit", "limit");
    const { keys } = fakeClient({ post: vi.fn(async () => Promise.reject(failure)) });
    await keys.load();
    await expect(keys.create("лишний")).rejects.toBe(failure);
    expect(keys.keys.value.map((key) => key.id)).toEqual(["old"]);
    expect(keys.revealed.value).toBeNull();
  });

  it("удаление убирает ключ из списка и прячет его, если он ещё показан", async () => {
    const { client, keys } = fakeClient();
    await keys.load();
    await keys.create("Claude Code");
    await keys.remove("new");
    expect(client.delete).toHaveBeenCalledWith("/auth/api-keys/new");
    expect(keys.keys.value.map((key) => key.id)).toEqual(["old"]);
    expect(keys.revealed.value).toBeNull();
  });

  it("лимит отражается флагом", async () => {
    const many = Array.from({ length: 10 }, (_, index) => apiKey(`k${index}`));
    const { keys } = fakeClient({ get: vi.fn(async () => ({ api_keys: many })) });
    expect(keys.atLimit.value).toBe(false);
    await keys.load();
    expect(keys.atLimit.value).toBe(true);
  });
});
