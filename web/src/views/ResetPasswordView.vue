<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "@/composables/shared/useAuth";
import { useI18n } from "@/composables/shared/useI18n";
import { useFormErrors } from "@/composables/forms/useFormErrors";
import { usePasswordActions } from "@/composables/account/usePasswordActions";
import { ApiError } from "@/lib/apiError";
import { validatePassword, validatePasswordConfirmation } from "@/lib/formValidation";
import { msg } from "@/lib/i18n/catalog";
import AuthLayout from "@/components/auth/AuthLayout.vue";
import NewPasswordFields from "@/components/auth/NewPasswordFields.vue";
import KrButton from "@/components/ui/KrButton.vue";

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const { t } = useI18n();
const { resetPassword } = usePasswordActions();
const { fields, summary, validate, clearField, capture } = useFormErrors(msg("auth.reset.failed"));

const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));
const password = ref("");
const confirmation = ref("");
const loading = ref(false);
const linkRejected = ref(false);
const linkInvalid = computed(() => !token.value || linkRejected.value);

async function submit() {
  const valid = validate({
    new_password: validatePassword(password.value),
    confirmation: validatePasswordConfirmation(password.value, confirmation.value),
  });
  if (!valid) return;
  loading.value = true;
  try {
    await resetPassword(token.value, password.value);
    auth.clearAuth();
    await router.push({ name: "login", query: { reset: "1" } });
  } catch (error) {
    if (error instanceof ApiError && error.code === "invalid_token") linkRejected.value = true;
    else capture(error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :title="t('auth.reset.title')" :subtitle="t('auth.reset.subtitle')">
    <div v-if="linkInvalid" :class="$style.invalid" data-testid="reset-invalid">
      <p :class="$style.error" role="alert">{{ t("auth.reset.invalidLink") }}</p>
      <router-link to="/forgot-password">{{ t("auth.reset.requestNew") }}</router-link>
    </div>
    <form v-else :class="$style.form" novalidate data-testid="reset-form" @submit.prevent="submit">
      <NewPasswordFields v-model:password="password" v-model:confirmation="confirmation" :errors="fields" @edit="clearField" />
      <div v-if="summary" :class="$style.error" role="alert">{{ summary }}</div>
      <KrButton :class="$style.submit" type="submit" size="lg" :loading="loading">
        {{ loading ? t("auth.reset.submitting") : t("auth.reset.submit") }}
      </KrButton>
    </form>
  </AuthLayout>
</template>

<style module>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.submit {
  width: 100%;
  margin-top: 4px;
  font-weight: var(--kr-font-weight-bold);
}

.invalid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
}

.error {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--kr-red-strong);
}
</style>
