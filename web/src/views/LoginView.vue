<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "@/composables/shared/useAuth";
import { useI18n } from "@/composables/shared/useI18n";
import { useFormErrors } from "@/composables/forms/useFormErrors";
import { validateEmail, validatePasswordEntered } from "@/lib/formValidation";
import { msg } from "@/lib/i18n/catalog";
import AuthLayout from "@/components/auth/AuthLayout.vue";
import CsInput from "@/components/ui/CsInput.vue";
import CsButton from "@/components/ui/CsButton.vue";

const router = useRouter();
const route = useRoute();
const auth = useAuth();
const { t } = useI18n();
const { fields: fieldErrors, summary: errorMsg, validate, clearField, capture } = useFormErrors(
  msg("auth.login.failed"),
);

const email = ref("");
const password = ref("");
const loading = ref(false);

async function handleLogin() {
  const valid = validate({
    email: validateEmail(email.value),
    password: validatePasswordEntered(password.value),
  });
  if (!valid) return;

  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    const redirect = (route.query.redirect as string) || "/";
    router.push(redirect);
  } catch (e: unknown) {
    capture(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :title="t('auth.login.title')" :subtitle="t('auth.login.subtitle')">
    <!-- Скрыто до реализации OAuth-провайдера Yandex ID (ROADMAP Фаза A) -->
    <!-- <button :class="$style.yandex" type="button">
      <span :class="$style.yandexMark">Я</span>
      Войти через Yandex ID
    </button> -->

    <div :class="$style.divider">
      <span :class="$style.line" />{{ t("auth.login.emailDivider") }}<span :class="$style.line" />
    </div>

    <form :class="$style.form" novalidate @submit.prevent="handleLogin">
      <CsInput
        v-model="email"
        :label="t('auth.field.email.label')"
        type="email"
        :placeholder="t('auth.field.email.placeholder')"
        autocomplete="email"
        :error="fieldErrors['email']"
        @update:model-value="clearField('email')"
      />
      <CsInput
        v-model="password"
        :label="t('auth.field.password.label')"
        type="password"
        placeholder="••••••••"
        autocomplete="current-password"
        :error="fieldErrors['password']"
        @update:model-value="clearField('password')"
      />
      <div v-if="errorMsg" :class="$style.error" role="alert">{{ errorMsg }}</div>
      <CsButton :class="$style.submit" type="submit" size="lg" :loading="loading">
        {{ loading ? t("auth.login.submitting") : t("auth.login.submit") }}
      </CsButton>
    </form>

    <p :class="$style.terms">{{ t("auth.login.terms") }}</p>
    <p :class="$style.footer">
      {{ t("auth.login.noAccount") }}
      <router-link to="/register">{{ t("auth.login.registerLink") }}</router-link>
    </p>
  </AuthLayout>
</template>

<style module>
.yandex {
  cursor: pointer;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  background: oklch(0.97 0.005 250);
  color: oklch(0.20 0.01 250);
  font-weight: var(--cs-font-weight-bold);
  font-size: 15px;
  padding: 13px;
  border: none;
  border-radius: 9px;
  transition: background var(--cs-transition-fast);
}

.yandex:hover {
  background: oklch(1 0 0);
}

.yandexMark {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--cs-red);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0;
  color: var(--cs-text-muted);
  font-size: 12px;
}

.line {
  flex: 1;
  height: 1px;
  background: var(--cs-border);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.submit {
  width: 100%;
  margin-top: 4px;
  font-weight: var(--cs-font-weight-bold);
}

.error {
  font-size: 13px;
  color: var(--cs-red-strong);
}

.terms {
  font-size: 12px;
  color: var(--cs-text-muted);
  text-align: center;
  margin: 20px 0 0;
  line-height: 1.5;
  white-space: pre-line;
}

.footer {
  text-align: center;
  margin: 14px 0 0;
  color: var(--cs-text-secondary);
  font-size: 13px;
}
</style>
