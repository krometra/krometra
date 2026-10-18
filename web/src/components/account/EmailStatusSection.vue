<script setup lang="ts">
import { computed } from "vue";
import { useAuth } from "@/composables/shared/useAuth";
import { useI18n } from "@/composables/shared/useI18n";
import KrIcon from "@/components/ui/KrIcon.vue";
import ResendVerificationButton from "./ResendVerificationButton.vue";

const auth = useAuth();
const { t } = useI18n();
const email = computed(() => auth.user.value?.email ?? "");
const verified = computed(() => auth.user.value?.email_verified ?? false);
</script>

<template>
  <section :class="$style.section" data-testid="email-status">
    <h2 :class="$style.title">{{ t("account.email.title") }}</h2>
    <p v-if="verified" :class="[$style.status, $style.ok]" data-testid="email-verified">
      <KrIcon name="shield" :size="16" />{{ t("account.email.verified", { email }) }}
    </p>
    <template v-else>
      <p :class="$style.status" data-testid="email-unverified">
        <KrIcon name="mail" :size="16" />{{ t("account.email.unverified", { email }) }}
      </p>
      <div>
        <ResendVerificationButton />
      </div>
    </template>
  </section>
</template>

<style module>
.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: var(--kr-font-size-lg);
  font-weight: var(--kr-font-weight-bold);
}

.status {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  color: var(--kr-text-secondary);
  font-size: 14px;
  line-height: 1.55;
}

.status svg {
  flex-shrink: 0;
  margin-top: 3px;
}

.ok svg {
  color: var(--kr-success);
}
</style>
