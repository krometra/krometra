<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "@/composables/shared/useAuth";
import { useI18n } from "@/composables/shared/useI18n";
import { useFormErrors } from "@/composables/forms/useFormErrors";
import { MIN_PASSWORD_LENGTH, validateEmail, validatePassword } from "@/lib/formValidation";
import { msg } from "@/lib/i18n/catalog";
import { toast } from "@/composables/useToast";
import AuthLayout from "@/components/auth/AuthLayout.vue";
import KrInput from "@/components/ui/KrInput.vue";
import KrButton from "@/components/ui/KrButton.vue";

const router = useRouter();
const auth = useAuth();
const { t } = useI18n();
const { fields: fieldErrors, summary: errorMsg, validate, clearField, capture } = useFormErrors(
  msg("auth.register.failed"),
);

const email = ref("");
const password = ref("");
const displayName = ref("");
const loading = ref(false);

const passwordHint = computed(() =>
  fieldErrors.value["password"] ? "" : t("auth.field.password.hint", { count: MIN_PASSWORD_LENGTH }),
);

async function handleRegister() {
  const valid = validate({
    email: validateEmail(email.value),
    password: validatePassword(password.value),
  });
  if (!valid) return;

  loading.value = true;
  try {
    await auth.register(email.value, password.value, displayName.value || undefined);
    await auth.login(email.value, password.value);
    toast(t("auth.register.verifySent", { email: email.value.trim() }), "success");
    router.push("/projects");
  } catch (e: unknown) {
    capture(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :title="t('auth.register.title')" :subtitle="t('auth.register.subtitle')">
    <form :class="$style.form" novalidate @submit.prevent="handleRegister">
      <KrInput
        v-model="displayName"
        :label="t('auth.field.name.label')"
        :placeholder="t('auth.field.name.placeholder')"
      />
      <KrInput
        v-model="email"
        :label="t('auth.field.email.label')"
        type="email"
        :placeholder="t('auth.field.email.placeholder')"
        autocomplete="email"
        :error="fieldErrors['email']"
        @update:model-value="clearField('email')"
      />
      <KrInput
        v-model="password"
        :label="t('auth.field.password.label')"
        type="password"
        placeholder="••••••••"
        autocomplete="new-password"
        :error="fieldErrors['password']"
        :hint="passwordHint"
        @update:model-value="clearField('password')"
      />
      <div v-if="errorMsg" :class="$style.error" role="alert">{{ errorMsg }}</div>
      <KrButton :class="$style.submit" type="submit" size="lg" :loading="loading">
        {{ loading ? t("auth.register.submitting") : t("auth.register.submit") }}
      </KrButton>
    </form>

    <p :class="$style.footer">
      {{ t("auth.register.hasAccount") }}
      <router-link to="/login">{{ t("auth.register.loginLink") }}</router-link>
    </p>
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

.error {
  font-size: 13px;
  color: var(--kr-red-strong);
}

.footer {
  text-align: center;
  margin: 14px 0 0;
  color: var(--kr-text-secondary);
  font-size: 13px;
}
</style>
