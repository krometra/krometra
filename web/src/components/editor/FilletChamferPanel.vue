<script setup lang="ts">
import FilletChamferToolbar from "@/components/toolbar/FilletChamferToolbar.vue";
import KrButton from "@/components/ui/KrButton.vue";
import EdgeSelectionList from "./EdgeSelectionList.vue";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { FilletChamferApi } from "@/composables/editor/useFilletChamfer";

defineProps<{ fillet: FilletChamferApi }>();
</script>

<template>
  <PropsPanelShell :title="fillet.mode.value === 'chamfer' ? 'Фаска' : 'Скругление'" kind="FEATURE" dot-color="oklch(0.72 0.14 120)">
    <FilletChamferToolbar
      :mode="fillet.mode.value"
      @update:mode="fillet.setMode"
      :selected-body-id="fillet.bodyId.value"
      :selected-edge-ids="fillet.edgeIds.value"
      :loading="fillet.loading.value"
      :error="fillet.error.value"
      @apply-fillet="fillet.applyFillet"
      @apply-chamfer="fillet.applyChamfer"
      @preview-change="fillet.updatePreview"
      @cancel="fillet.exit"
      @clear="fillet.clear"
    >
      <template #selection>
        <EdgeSelectionList
          :rows="fillet.edgeRows.value"
          :chain="fillet.chain.value"
          @update:chain="fillet.setChain"
          @remove="fillet.removeRow"
          @highlight="fillet.highlightRow"
          @unhighlight="fillet.clearRowHighlight"
        />
      </template>
    </FilletChamferToolbar>
    <template #foot>
      <KrButton variant="ghost" size="sm" :class="$style.cancelBtn" @click="fillet.exit">Закрыть</KrButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.cancelBtn.cancelBtn {
  flex: 1;
  height: auto;
  background: transparent;
  border: 1px solid var(--kr-border-strong);
  font-size: 13px;
  padding: 9px;
  border-radius: 7px;
  color: var(--kr-text-secondary);
  transition: border-color var(--kr-transition-fast);
}

.cancelBtn.cancelBtn:hover {
  background: transparent;
  border-color: var(--kr-text-muted);
  color: var(--kr-text);
}
</style>
