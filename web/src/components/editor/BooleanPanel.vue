<script setup lang="ts">
import BooleanToolbar from "@/components/toolbar/BooleanToolbar.vue";
import CsButton from "@/components/ui/CsButton.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { BooleanModeApi } from "@/composables/editor/useBooleanMode";

defineProps<{ boolean: BooleanModeApi }>();
</script>

<template>
  <PropsPanelShell title="Boolean" kind="CSG" dot-color="oklch(0.65 0.14 300)">
    <BooleanToolbar
      :available-bodies="boolean.availableBodies.value"
      :selected-target-id="boolean.targetId.value"
      :selected-tool-id="boolean.toolId.value"
      :selected-operation="boolean.operation.value"
      :loading="boolean.loading.value"
      :error="boolean.error.value"
      @select-target="boolean.selectTarget"
      @select-tool="boolean.selectTool"
      @set-operation="boolean.setOperation"
      @apply="boolean.apply"
      @cancel="boolean.exit"
      @clear="boolean.clear"
    />
    <template #foot>
      <CsButton variant="ghost" size="sm" :class="$style.cancelBtn" @click="boolean.exit">
        Закрыть
      </CsButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.cancelBtn.cancelBtn {
  flex: 1;
  height: auto;
  border: 1px solid var(--cs-border-strong);
  font-size: 13px;
  padding: 9px;
  border-radius: 7px;
  color: var(--cs-text-secondary);
}

.cancelBtn.cancelBtn:hover {
  background: transparent;
  border-color: var(--cs-text-muted);
  color: var(--cs-text);
}
</style>
