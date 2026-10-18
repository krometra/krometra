import { describe, expect, it, vi } from "vitest";
import { usePasswordActions, type PasswordClient } from "./usePasswordActions";

function setup() {
  const post = vi.fn(async () => undefined);
  return { post, actions: usePasswordActions({ post } as unknown as PasswordClient) };
}

describe("usePasswordActions", () => {
  it("запрос восстановления шлёт почту без пробелов по краям", async () => {
    const { post, actions } = setup();
    await actions.requestReset("  alice@example.com ");
    expect(post).toHaveBeenCalledWith("/auth/password/forgot", { email: "alice@example.com" });
  });

  it("сброс по ссылке шлёт токен и новый пароль", async () => {
    const { post, actions } = setup();
    await actions.resetPassword("tok", "new-pass-123");
    expect(post).toHaveBeenCalledWith("/auth/password/reset", { token: "tok", new_password: "new-pass-123" });
  });

  it("смена пароля шлёт текущий и новый пароль", async () => {
    const { post, actions } = setup();
    await actions.changePassword("old-pass-123", "new-pass-123");
    expect(post).toHaveBeenCalledWith("/auth/password/change", {
      current_password: "old-pass-123",
      new_password: "new-pass-123",
    });
  });
});
