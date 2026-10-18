<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { useFormErrors } from "@/composables/forms/useFormErrors";
import { usePasswordActions } from "@/composables/account/usePasswordActions";
import { toast } from "@/composables/useToast";
import { validatePassword, validatePasswordConfirmation, validatePasswordEntered } from "@/lib/formValidation";
import { msg } from "@/lib/i18n/catalog";
import NewPasswordFields from "@/components/auth/NewPasswordFields.vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrInput from "@/components/ui/KrInput.vue";

const { t } = useI18n();
const { changePassword } = usePasswordActions();
const { fields, summary, validate, clearField, capture } = useFormErrors(msg("account.password.failed"));

const current = ref("");
const password = ref("");
const confirmation = ref("");
const saving = ref(false);

async function submit() {
  const valid = validate({
    current_password: validatePasswordEntered(current.value),
    new_password: validatePassword(password.value),
    confirmation: validatePasswordConfirmation(password.value, confirmation.value),
  });
  if (!valid) return;
  saving.value = true;
  try {
    await changePassword(current.value, password.value);
    current.value = "";
    password.value = "";
    confirmation.value = "";
    toast(t("account.password.changed"), "success");
  } catch (error) {
    capture(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form :class="$style.form" novalidate data-testid="password-change" @submit.prevent="submit">
    <KrInput
      v-model="current"
      :label="t('account.password.current')"
      type="password"
      placeholder="••••••••"
      autocomplete="current-password"
      :error="fields['current_password']"
      @update:model-value="clearField('current_password')"
    />
    <NewPasswordFields v-model:password="password" v-model:confirmation="confirmation" :errors="fields" @edit="clearField" />
    <div v-if="summary" :class="$style.error" role="alert">{{ summary }}</div>
    <div :class="$style.actions">
      <KrButton type="submit" size="md" :loading="saving">{{ t("account.password.submit") }}</KrButton>
      <span :class="$style.forgot">
        {{ t("account.password.forgot") }}
        <router-link to="/forgot-password">{{ t("account.password.forgotLink") }}</router-link>
      </span>
    </div>
  </form>
</template>

<style module>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 420px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.forgot {
  color: var(--kr-text-secondary);
  font-size: var(--kr-font-size-sm);
}

.error {
  color: var(--kr-error);
  font-size: var(--kr-font-size-sm);
}
</style>
