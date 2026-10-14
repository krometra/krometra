<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { useFormErrors } from "@/composables/forms/useFormErrors";
import { API_KEY_LIMIT, validateKeyName } from "@/lib/apiKeys";
import { msg } from "@/lib/i18n/catalog";
import CsButton from "@/components/ui/CsButton.vue";
import CsInput from "@/components/ui/CsInput.vue";

const props = defineProps<{
  create: (name: string) => Promise<void>;
  atLimit: boolean;
}>();

const { t } = useI18n();
const { fields, summary, validate, clearField, capture } = useFormErrors(msg("account.keys.createFailed"));

const name = ref("");
const creating = ref(false);

async function submit() {
  if (!validate({ name: validateKeyName(name.value) })) return;
  creating.value = true;
  try {
    await props.create(name.value);
    name.value = "";
  } catch (error) {
    capture(error);
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <p v-if="atLimit" :class="$style.limit" role="status">
    {{ t("account.keys.limitReached", { count: API_KEY_LIMIT }) }}
  </p>
  <form v-else :class="$style.form" novalidate data-testid="api-key-create" @submit.prevent="submit">
    <div :class="$style.name">
      <CsInput
        v-model="name"
        :label="t('account.keys.name.label')"
        :placeholder="t('account.keys.name.placeholder')"
        autocomplete="off"
        :error="fields['name']"
        @update:model-value="clearField('name')"
      />
    </div>
    <CsButton type="submit" size="md" :loading="creating" :class="$style.submit">
      {{ t("account.keys.create") }}
    </CsButton>
    <div v-if="summary" :class="$style.error" role="alert">{{ summary }}</div>
  </form>
</template>

<style module>
.form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.name {
  flex: 1 1 280px;
  max-width: 420px;
}

.submit {
  flex-shrink: 0;
}

.error {
  flex-basis: 100%;
  color: var(--cs-error);
  font-size: var(--cs-font-size-sm);
}

.limit {
  margin: 0;
  color: var(--cs-text-secondary);
  font-size: var(--cs-font-size-sm);
}
</style>
