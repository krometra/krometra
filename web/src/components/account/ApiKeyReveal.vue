<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { connectCommand } from "@/lib/mcpConnect";
import type { ApiKeyCreated } from "@/types/api";
import CsButton from "@/components/ui/CsButton.vue";
import AgentPromptCopy from "./AgentPromptCopy.vue";
import CopyField from "./CopyField.vue";

const props = defineProps<{ created: ApiKeyCreated; origin: string }>();
const emit = defineEmits<{ dismiss: [] }>();

const { t } = useI18n();
const command = computed(() => connectCommand(props.origin, props.created.key));
</script>

<template>
  <div :class="$style.reveal" data-testid="api-key-reveal">
    <div :class="$style.title">{{ t("account.created.title", { name: created.name }) }}</div>
    <p :class="$style.warning" role="alert">{{ t("account.created.warning") }}</p>
    <CopyField :label="t('account.created.keyLabel')" :value="created.key" test-id="api-key-value" />
    <CopyField :label="t('account.created.commandLabel')" :value="command" test-id="api-key-command" />
    <div :class="$style.actions">
      <AgentPromptCopy :origin="origin" :api-key="created.key" />
      <CsButton variant="secondary" size="md" @click="emit('dismiss')">{{ t("account.created.done") }}</CsButton>
    </div>
  </div>
</template>

<style module>
.reveal {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--cs-green-border);
  border-radius: var(--cs-radius-lg);
  background: var(--cs-surface-raised);
}

.title {
  font-size: var(--cs-font-size-lg);
  font-weight: var(--cs-font-weight-bold);
}

.warning {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--cs-amber-border);
  border-radius: var(--cs-radius-md);
  color: var(--cs-text);
  font-size: var(--cs-font-size-sm);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}
</style>
