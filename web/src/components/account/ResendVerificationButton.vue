<script setup lang="ts">
import { useEmailVerification } from "@/composables/shared/useEmailVerification";
import { useI18n } from "@/composables/shared/useI18n";
import { toast, toastApiError } from "@/composables/useToast";
import KrButton from "@/components/ui/KrButton.vue";

withDefaults(defineProps<{ variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" }>(), {
  variant: "secondary",
  size: "sm",
});

const { t } = useI18n();
const verification = useEmailVerification();

async function resend() {
  try {
    await verification.resend();
    if (verification.needsVerification.value) toast(t("account.email.sent"), "success");
  } catch (error) {
    toastApiError(error, t("account.email.resendFailed"));
  }
}
</script>

<template>
  <KrButton
    :variant="variant"
    :size="size"
    :loading="verification.sending.value"
    :disabled="verification.waitSeconds.value > 0"
    data-testid="resend-verification"
    @click="resend"
  >
    {{
      verification.waitSeconds.value > 0
        ? t("account.email.resendIn", { seconds: verification.waitSeconds.value })
        : t("account.email.resend")
    }}
  </KrButton>
</template>
