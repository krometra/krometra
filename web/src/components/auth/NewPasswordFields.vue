<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { MIN_PASSWORD_LENGTH } from "@/lib/formValidation";
import type { FieldErrors } from "@/lib/apiError";
import KrInput from "@/components/ui/KrInput.vue";

const props = defineProps<{ errors: FieldErrors }>();
const emit = defineEmits<{ edit: [field: "new_password" | "confirmation"] }>();
const password = defineModel<string>("password", { required: true });
const confirmation = defineModel<string>("confirmation", { required: true });

const { t } = useI18n();
const hint = computed(() =>
  props.errors["new_password"] ? "" : t("auth.field.password.hint", { count: MIN_PASSWORD_LENGTH }),
);
</script>

<template>
  <KrInput
    v-model="password"
    :label="t('auth.field.newPassword.label')"
    type="password"
    placeholder="••••••••"
    autocomplete="new-password"
    :error="errors['new_password']"
    :hint="hint"
    @update:model-value="emit('edit', 'new_password')"
  />
  <KrInput
    v-model="confirmation"
    :label="t('auth.field.confirmPassword.label')"
    type="password"
    placeholder="••••••••"
    autocomplete="new-password"
    :error="errors['confirmation']"
    @update:model-value="emit('edit', 'confirmation')"
  />
</template>
