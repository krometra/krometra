import { computed, ref, type Ref } from "vue";
import { useTimestamp } from "@vueuse/core";
import { ApiError } from "@/lib/apiError";
import { cooldownEnd, secondsLeft } from "@/lib/resendCooldown";
import type { useApi } from "@/composables/useApi";
import type { User } from "@/types/api";

export type VerificationClient = Pick<ReturnType<typeof useApi>, "post">;

export interface VerificationAuth {
  user: Readonly<Ref<User | null>>;
  isAuthenticated: Readonly<Ref<boolean>>;
  fetchMe: () => Promise<User>;
}

export function createEmailVerification(
  api: VerificationClient,
  auth: VerificationAuth,
  now: Readonly<Ref<number>> = useTimestamp({ interval: 1000 }),
) {
  const resendEnd = ref<number | null>(null);
  const sending = ref(false);
  const sent = ref(false);
  const waitSeconds = computed(() => secondsLeft(resendEnd.value, now.value));
  const needsVerification = computed(() => auth.user.value !== null && !auth.user.value.email_verified);

  async function resend(): Promise<void> {
    sending.value = true;
    try {
      await api.post<void>("/auth/verify-email/resend");
      sent.value = true;
      resendEnd.value = cooldownEnd(now.value);
    } catch (error) {
      if (error instanceof ApiError && error.code === "email_already_verified") {
        await auth.fetchMe();
        return;
      }
      if (error instanceof ApiError && error.status === 429) resendEnd.value = cooldownEnd(now.value);
      throw error;
    } finally {
      sending.value = false;
    }
  }

  async function verify(token: string): Promise<void> {
    await api.post<void>("/auth/verify-email", { token });
    if (auth.isAuthenticated.value) await auth.fetchMe();
  }

  return { sending, sent, waitSeconds, needsVerification, resend, verify };
}
