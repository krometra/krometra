<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { useFormErrors } from "@/composables/forms/useFormErrors";
import { usePasswordActions } from "@/composables/account/usePasswordActions";
import { validateEmail } from "@/lib/formValidation";
import { msg } from "@/lib/i18n/catalog";
import AuthLayout from "@/components/auth/AuthLayout.vue";
import KrInput from "@/components/ui/KrInput.vue";
import KrButton from "@/components/ui/KrButton.vue";

const { t } = useI18n();
const { requestReset } = usePasswordActions();
const { fields, summary, validate, clearField, capture } = useFormErrors(msg("auth.forgot.failed"));

const email = ref("");
const sentTo = ref<string | null>(null);
const loading = ref(false);

async function submit() {
  if (!validate({ email: validateEmail(email.value) })) return;
  loading.value = true;
  try {
    await requestReset(email.value);
    sentTo.value = email.value.trim();
  } catch (error) {
    capture(error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :title="t('auth.forgot.title')" :subtitle="t('auth.forgot.subtitle')">
    <p v-if="sentTo" :class="$style.sent" role="status" data-testid="forgot-sent">
      {{ t("auth.forgot.sent", { email: sentTo }) }}
    </p>
    <form v-else :class="$style.form" novalidate data-testid="forgot-form" @submit.prevent="submit">
      <KrInput
        v-model="email"
        :label="t('auth.field.email.label')"
        type="email"
        :placeholder="t('auth.field.email.placeholder')"
        autocomplete="email"
        :error="fields['email']"
        @update:model-value="clearField('email')"
      />
      <div v-if="summary" :class="$style.error" role="alert">{{ summary }}</div>
      <KrButton :class="$style.submit" type="submit" size="lg" :loading="loading">
        {{ loading ? t("auth.forgot.submitting") : t("auth.forgot.submit") }}
      </KrButton>
    </form>

    <p :class="$style.footer">
      <router-link to="/login">{{ t("auth.forgot.backToLogin") }}</router-link>
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

.sent {
  margin: 0;
  color: var(--kr-text);
  font-size: 14px;
  line-height: 1.55;
}

.error {
  font-size: 13px;
  color: var(--kr-red-strong);
}

.footer {
  text-align: center;
  margin: 18px 0 0;
  font-size: 13px;
}
</style>
