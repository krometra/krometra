<script setup lang="ts">
import { computed } from "vue";
import CsDialog from "@/components/ui/CsDialog.vue";
import CsButton from "@/components/ui/CsButton.vue";
import { EDITOR_SHORTCUTS } from "@/composables/editor/useEditorHotkeys";

const open = defineModel<boolean>("open", { required: true });

const groups = computed(() => {
  const byGroup = new Map<string, typeof EDITOR_SHORTCUTS>();
  for (const s of EDITOR_SHORTCUTS) {
    const list = byGroup.get(s.group) ?? [];
    list.push(s);
    byGroup.set(s.group, list);
  }
  return [...byGroup.entries()];
});
</script>

<template>
  <CsDialog v-model:open="open">
    <template #title>Горячие клавиши</template>
    <div :class="$style.groups">
      <section v-for="[group, items] in groups" :key="group">
        <h3 :class="$style.groupTitle">{{ group }}</h3>
        <div v-for="s in items" :key="s.keys" :class="$style.row">
          <span :class="$style.desc">{{ s.description }}</span>
          <kbd :class="$style.key">{{ s.keys }}</kbd>
        </div>
      </section>
    </div>
    <template #footer>
      <CsButton variant="secondary" size="md" @click="open = false">Закрыть</CsButton>
    </template>
  </CsDialog>
</template>

<style module>
.groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 340px;
}

.groupTitle {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cs-text-muted);
  font-weight: var(--cs-font-weight-medium);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 5px 0;
}

.desc {
  font-size: 13px;
  color: var(--cs-text-secondary);
}

.key {
  font-family: var(--cs-font-mono);
  font-size: 11.5px;
  padding: 3px 8px;
  border: 1px solid var(--cs-border-strong);
  border-radius: 5px;
  background: var(--cs-surface-sunken, var(--cs-surface));
  color: var(--cs-text);
  white-space: nowrap;
}
</style>
