<script setup lang="ts">
import { useAuth } from "@/composables/shared/useAuth";
import { useEmailVerification } from "@/composables/shared/useEmailVerification";
import { useI18n } from "@/composables/shared/useI18n";
import KrIcon from "@/components/ui/KrIcon.vue";
import ResendVerificationButton from "./ResendVerificationButton.vue";

const auth = useAuth();
const { t } = useI18n();
const verification = useEmailVerification();
</script>

<template>
  <div v-if="verification.needsVerification.value" :class="$style.banner" role="status" data-testid="email-verify-banner">
    <KrIcon name="mail" :size="16" :class="$style.icon" />
    <span :class="$style.text">
      {{ t("account.email.banner", { email: auth.user.value?.email ?? "" }) }}
      {{ t("account.email.bannerQuestion") }}
    </span>
    <ResendVerificationButton variant="ghost" />
  </div>
</template>

<style module>
.banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 16px 30px 0;
  padding: 8px 12px 8px 14px;
  border: 1px solid var(--kr-border);
  border-radius: var(--kr-radius-md);
  background: var(--kr-surface-raised);
  color: var(--kr-text-secondary);
  font-size: var(--kr-font-size-sm);
}

.icon {
  flex-shrink: 0;
  color: var(--kr-accent);
}

.text {
  flex: 1 1 240px;
}

@media (max-width: 600px) {
  .banner {
    margin-left: 16px;
    margin-right: 16px;
  }
}
</style>
