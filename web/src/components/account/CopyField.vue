<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { useI18n } from "@/composables/shared/useI18n";
import { toast } from "@/composables/useToast";
import KrButton from "@/components/ui/KrButton.vue";
import KrIcon from "@/components/ui/KrIcon.vue";

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
      <KrButton variant="secondary" size="sm" :class="$style.copy" @click="copyValue">
        <KrIcon name="copy" :size="14" />
        {{ copied ? t("account.copied") : t("account.copy") }}
      </KrButton>
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
  font-size: var(--kr-font-size-sm);
  color: var(--kr-text-secondary);
}

.box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--kr-surface-sunken);
  border: 1px solid var(--kr-border);
  border-radius: var(--kr-radius-md);
}

.value {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--kr-font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--kr-text);
  white-space: pre-wrap;
  word-break: break-all;
}

.copy {
  flex-shrink: 0;
}
</style>
