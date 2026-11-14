<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
const { t } = useI18n();
import KrButton from "@/components/ui/KrButton.vue";

defineProps<{ error: string | null }>();

const emit = defineEmits<{ cancel: [] }>();
</script>

<template>
  <div :class="$style.banner" data-testid="sketch-plane-pick-banner">
    <span>{{ t("editorPanels.click_a_base_plane_a_planar_body_face_or_a_wo") }}</span>
    <span v-if="error" :class="$style.error">{{ error }}</span>
    <KrButton variant="secondary" size="sm" @click="emit('cancel')">{{ t("editorPanels.cancel_esc") }}</KrButton>
  </div>
</template>

<style module>
.banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 90%;
  padding: 10px 16px;
  background: var(--kr-surface-raised);
  border: 1px solid var(--kr-primary);
  border-radius: 10px;
  color: var(--kr-text);
  font-size: 13px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.error {
  color: var(--kr-error);
  font-size: 12px;
}
</style>
