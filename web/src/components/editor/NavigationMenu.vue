<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import KrButton from "@/components/ui/KrButton.vue";
import KrCheckbox from "@/components/ui/KrCheckbox.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import { NAVIGATION_PRESETS, presetHints } from "@/lib/navigation/navigationPresets";
import { useNavigationSettings } from "@/composables/shared/useNavigationSettings";

const navigation = useNavigationSettings();
const open = ref(false);
const root = ref<HTMLElement>();
const hints = computed(() => presetHints(navigation.settings.value.preset));

onClickOutside(root, () => (open.value = false));
</script>

<template>
  <div ref="root" :class="$style.root">
    <KrButton
      variant="ghost"
      size="sm"
      :class="[$style.trigger, open && $style.triggerActive]"
      title="Навигация: мышь и трекпад"
      aria-label="Навигация: мышь и трекпад"
      :aria-expanded="open"
      data-testid="navigation-menu"
      @click="open = !open"
    >
      <KrIcon name="mouse" :size="17" />
    </KrButton>

    <div v-if="open" :class="$style.panel" role="dialog" aria-label="Навигация" data-testid="navigation-panel">
      <div :class="$style.title">Мышь как в</div>
      <div :class="$style.presets" role="radiogroup" aria-label="Пресет мыши">
        <KrButton
          v-for="preset in NAVIGATION_PRESETS"
          :key="preset.id"
          variant="ghost"
          size="sm"
          role="radio"
          :aria-checked="navigation.settings.value.preset === preset.id"
          :class="[$style.preset, navigation.settings.value.preset === preset.id && $style.presetActive]"
          :data-testid="`navigation-preset-${preset.id}`"
          @click="navigation.setPreset(preset.id)"
        >
          {{ preset.label }}
        </KrButton>
      </div>
      <ul :class="$style.hints" data-testid="navigation-hints">
        <li v-for="hint in hints" :key="hint">{{ hint }}</li>
      </ul>

      <div :class="$style.title">Трекпад</div>
      <ul :class="$style.hints">
        <li>Щипок - зум к курсору</li>
        <li>{{ navigation.settings.value.trackpadPan ? "Два пальца - панорама" : "Колесо и два пальца - зум" }}</li>
        <li v-if="navigation.settings.value.trackpadPan">Shift + два пальца - вращение</li>
      </ul>
      <KrCheckbox
        label="Трекпад: два пальца - панорама"
        :model-value="navigation.settings.value.trackpadPan"
        data-testid="navigation-trackpad-pan"
        @update:model-value="navigation.setTrackpadPan"
      />
    </div>
  </div>
</template>

<style module>
.root {
  position: relative;
  display: flex;
}

.trigger.trigger {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 6px;
  color: var(--kr-text-secondary);
}

.trigger:hover {
  background: var(--kr-surface-hover);
  color: var(--kr-text);
}

.triggerActive.triggerActive {
  background: var(--kr-primary-soft);
  color: var(--kr-primary-active);
}

.panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  width: 250px;
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-xs);
  padding: var(--kr-spacing-sm);
  background: var(--kr-surface-raised);
  border: 1px solid var(--kr-border-strong);
  border-radius: var(--kr-radius-md);
  box-shadow: var(--kr-shadow-md);
  z-index: 20;
}

.title {
  font-size: var(--kr-font-size-xs);
  font-weight: var(--kr-font-weight-bold);
  color: var(--kr-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.preset.preset {
  padding: 2px 8px;
  border: 1px solid var(--kr-border);
  border-radius: var(--kr-radius-sm);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
}

.presetActive.presetActive,
.presetActive.presetActive:hover {
  background: var(--kr-primary);
  border-color: var(--kr-primary);
  color: var(--kr-primary-fg);
}

.hints {
  margin: 0 0 var(--kr-spacing-xs);
  padding-left: var(--kr-spacing-md);
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
  line-height: 1.5;
}
</style>
