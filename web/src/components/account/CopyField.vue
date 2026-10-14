<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { useI18n } from "@/composables/shared/useI18n";
import { toast } from "@/composables/useToast";
import CsButton from "@/components/ui/CsButton.vue";
import CsIcon from "@/components/ui/CsIcon.vue";

const props = defineProps<{ value: string; label?: string; testId?: string }>();

const { t } = useI18n();
const { copy, copied } = useClipboard({ legacy: true });

async function copyValue() {
  try {
    await copy(props.value);
  } catch {
    toast(t("account.copyFailed"), "error");
  }
}
</script>

<template>
  <div :class="$style.field">
    <div v-if="label" :class="$style.label">{{ label }}</div>
    <div :class="$style.box">
      <pre :class="$style.value" :data-testid="testId">{{ value }}</pre>
      <CsButton variant="secondary" size="sm" :class="$style.copy" @click="copyValue">
        <CsIcon name="copy" :size="14" />
        {{ copied ? t("account.copied") : t("account.copy") }}
      </CsButton>
    </div>
  </div>
</template>

<style module>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.label {
  font-size: var(--cs-font-size-sm);
  color: var(--cs-text-secondary);
}

.box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--cs-surface-sunken);
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-md);
}

.value {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--cs-font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--cs-text);
  white-space: pre-wrap;
  word-break: break-all;
}

.copy {
  flex-shrink: 0;
}
</style>
