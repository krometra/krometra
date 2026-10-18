<script setup lang="ts">
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import type { ProfileRegionsApi } from "@/composables/editor/useProfileRegions";
import { profileRegionsLabel } from "@/lib/profileRegionSelection";

const props = defineProps<{ profile: ProfileRegionsApi }>();
const { selected, regions, pickable, reset } = props.profile;

const label = computed(() => profileRegionsLabel(selected.value.length, regions.value.length));
</script>

<template>
  <div :class="$style.field">
    <div :class="$style.label">Профиль</div>
    <div :class="$style.row">
      <span :class="$style.value" data-testid="profile-regions">{{ label }}</span>
      <KrButton v-if="selected.length > 0" variant="ghost" size="sm" data-testid="profile-regions-reset" @click="reset">
        Весь эскиз
      </KrButton>
    </div>
    <div v-if="pickable" :class="$style.hint">Клик по области эскиза выбирает её, Shift добавляет или убирает</div>
  </div>
</template>

<style module>
.field {
  margin-bottom: 13px;
}

.label {
  font-size: 12px;
  color: var(--kr-text-secondary);
  margin-bottom: 6px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--kr-spacing-sm);
  min-height: 28px;
}

.value {
  font-family: var(--kr-font-mono);
  font-size: 13px;
  color: var(--kr-text);
}

.hint {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--kr-text-muted);
}
</style>
