<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "@/composables/shared/useAuth";
import { useEmailVerification } from "@/composables/shared/useEmailVerification";
import { useI18n } from "@/composables/shared/useI18n";
import { ApiError, errorMessage } from "@/lib/apiError";
import AuthLayout from "@/components/auth/AuthLayout.vue";
import ResendVerificationButton from "@/components/account/ResendVerificationButton.vue";
import KrButton from "@/components/ui/KrButton.vue";

type Outcome = "pending" | "verified" | "invalid" | "failed";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const verification = useEmailVerification();
const { t } = useI18n();

const outcome = ref<Outcome>("pending");
const failure = ref("");
const alreadyVerified = computed(() => auth.user.value?.email_verified === true);

async function verify(token: string) {
  try {
    await verification.verify(token);
    outcome.value = "verified";
  } catch (error) {
    if (error instanceof ApiError && error.code === "invalid_token") {
      outcome.value = alreadyVerified.value ? "verified" : "invalid";
      return;
    }
    failure.value = errorMessage(error, t("auth.verify.failed"));
    outcome.value = "failed";
  }
}

onMounted(() => {
  const token = route.query.token;
  if (typeof token === "string" && token) void verify(token);
  else outcome.value = alreadyVerified.value ? "verified" : "invalid";
});
</script>

<template>
  <AuthLayout :title="t('auth.verify.title')" :subtitle="t('auth.verify.subtitle')">
    <div :class="$style.body" data-testid="verify-email">
      <p v-if="outcome === 'pending'" :class="$style.muted">{{ t("auth.verify.pending") }}</p>

      <template v-else-if="outcome === 'verified'">
        <p :class="$style.success" role="status" data-testid="verify-email-success">{{ t("auth.verify.success") }}</p>
        <KrButton v-if="auth.isAuthenticated.value" size="lg" :class="$style.wide" @click="router.push('/projects')">
          {{ t("auth.verify.toProjects") }}
        </KrButton>
        <KrButton v-else size="lg" :class="$style.wide" @click="router.push('/login')">{{ t("auth.verify.toLogin") }}</KrButton>
      </template>

      <template v-else>
        <p :class="$style.error" role="alert" data-testid="verify-email-error">
          {{ outcome === "failed" ? failure : t("auth.verify.invalidLink") }}
        </p>
        <ResendVerificationButton v-if="auth.isAuthenticated.value" variant="primary" size="md" />
        <p v-else :class="$style.muted">
          {{ t("auth.verify.loginToResend") }}
          <router-link :to="{ name: 'login', query: { redirect: '/account' } }">{{ t("auth.verify.toLogin") }}</router-link>
        </p>
      </template>
    </div>
  </AuthLayout>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
}

.wide {
  width: 100%;
  font-weight: var(--kr-font-weight-bold);
}

.muted {
  margin: 0;
  color: var(--kr-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.success {
  margin: 0;
  color: var(--kr-green-strong);
  font-size: 15px;
  font-weight: var(--kr-font-weight-medium);
}

.error {
  margin: 0;
  color: var(--kr-red-strong);
  font-size: 14px;
  line-height: 1.5;
}
</style>
