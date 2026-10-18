import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { createEmailVerification, type VerificationClient } from "./emailVerification";
import { ApiError } from "@/lib/apiError";
import { RESEND_COOLDOWN_MS } from "@/lib/resendCooldown";
import type { User } from "@/types/api";

function user(emailVerified: boolean): User {
  return {
    id: "u1",
    email: "alice@example.com",
    display_name: "Alice",
    is_admin: false,
    email_verified: emailVerified,
    created_at: "2026-10-18T10:00:00Z",
  };
}

function setup(post: ReturnType<typeof vi.fn>, current: User | null = user(false)) {
  const me = ref<User | null>(current);
  const fetchMe = vi.fn(async () => {
    me.value = user(true);
    return me.value;
  });
  const auth = { user: me, isAuthenticated: computed(() => me.value !== null), fetchMe };
  const now = ref(1_000_000);
  const verification = createEmailVerification({ post } as unknown as VerificationClient, auth, now);
  return { verification, fetchMe, me, now };
}

describe("подтверждение почты", () => {
  it("плашка нужна только неподтверждённому пользователю", () => {
    expect(setup(vi.fn()).verification.needsVerification.value).toBe(true);
    expect(setup(vi.fn(), user(true)).verification.needsVerification.value).toBe(false);
    expect(setup(vi.fn(), null).verification.needsVerification.value).toBe(false);
  });

  it("после отправки кнопка ждёт кулдаун", async () => {
    const post = vi.fn(async () => undefined);
    const { verification, now } = setup(post);
    await verification.resend();
    expect(post).toHaveBeenCalledWith("/auth/verify-email/resend");
    expect(verification.sent.value).toBe(true);
    now.value += 1_000;
    expect(verification.waitSeconds.value).toBe(RESEND_COOLDOWN_MS / 1000 - 1);
    now.value += RESEND_COOLDOWN_MS;
    expect(verification.waitSeconds.value).toBe(0);
  });

  it("лимит сервера тоже включает кулдаун, а ошибку отдаёт наверх", async () => {
    const failure = new ApiError(429, "rate_limited", "Слишком часто");
    const { verification, now } = setup(vi.fn(async () => Promise.reject(failure)));
    await expect(verification.resend()).rejects.toBe(failure);
    now.value += 1_000;
    expect(verification.waitSeconds.value).toBeGreaterThan(0);
    expect(verification.sending.value).toBe(false);
  });

  it("если почта уже подтверждена, обновляет пользователя без ошибки", async () => {
    const { verification, fetchMe, me } = setup(
      vi.fn(async () => Promise.reject(new ApiError(409, "email_already_verified", "Почта уже подтверждена."))),
    );
    await verification.resend();
    expect(fetchMe).toHaveBeenCalled();
    expect(me.value?.email_verified).toBe(true);
  });

  it("подтверждение по ссылке обновляет вошедшего пользователя", async () => {
    const post = vi.fn(async () => undefined);
    const { verification, fetchMe } = setup(post);
    await verification.verify("tok");
    expect(post).toHaveBeenCalledWith("/auth/verify-email", { token: "tok" });
    expect(fetchMe).toHaveBeenCalled();
  });

  it("аноним подтверждает почту без запроса профиля", async () => {
    const post = vi.fn(async () => undefined);
    const { verification, fetchMe } = setup(post, null);
    await verification.verify("tok");
    expect(post).toHaveBeenCalledWith("/auth/verify-email", { token: "tok" });
    expect(fetchMe).not.toHaveBeenCalled();
  });
});
