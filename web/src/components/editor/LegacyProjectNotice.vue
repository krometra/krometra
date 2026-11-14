<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import { useRouter } from "vue-router";
import KrButton from "@/components/ui/KrButton.vue";

const router = useRouter();
</script>

<template>
  <div :class="$style.backdrop" role="alertdialog" aria-labelledby="legacy-project-title" data-testid="legacy-project">
    <div :class="$style.card">
      <h2 id="legacy-project-title" :class="$style.title">{{ t("editorPanels.legacy_title") }}</h2>
      <p :class="$style.text">
        {{ t("editorPanels.legacy_text", { product: t("common.productName") }) }}
      </p>
      <KrButton @click="router.push('/projects')">{{ t("editorPanels.back_projects") }}</KrButton>
    </div>
  </div>
</template>

<style module>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: color-mix(in oklch, var(--kr-surface) 80%, transparent);
}

.card {
  max-width: 440px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--kr-border-strong);
  border-radius: 12px;
  background: var(--kr-surface-raised, var(--kr-surface));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.title {
  margin: 0;
  font-size: 16px;
  color: var(--kr-text);
}

.text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--kr-text-muted);
}
</style>
