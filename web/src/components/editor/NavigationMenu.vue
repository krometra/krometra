<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import CsButton from "@/components/ui/CsButton.vue";
import CsCheckbox from "@/components/ui/CsCheckbox.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
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
    <CsButton
      variant="ghost"
      size="sm"
      :class="[$style.trigger, open && $style.triggerActive]"
      title="Навигация: мышь и трекпад"
      aria-label="Навигация: мышь и трекпад"
      :aria-expanded="open"
      data-testid="navigation-menu"
      @click="open = !open"
    >
      <CsIcon name="mouse" :size="17" />
    </CsButton>

    <div v-if="open" :class="$style.panel" role="dialog" aria-label="Навигация" data-testid="navigation-panel">
      <div :class="$style.title">Мышь как в</div>
      <div :class="$style.presets" role="radiogroup" aria-label="Пресет мыши">
        <CsButton
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
        </CsButton>
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
      <CsCheckbox
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
  color: var(--cs-text-secondary);
}

.trigger:hover {
  background: var(--cs-surface-hover);
  color: var(--cs-text);
}

.triggerActive.triggerActive {
  background: var(--cs-primary-soft);
  color: var(--cs-primary-active);
}

.panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  width: 250px;
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-xs);
  padding: var(--cs-spacing-sm);
  background: var(--cs-surface-raised);
  border: 1px solid var(--cs-border-strong);
  border-radius: var(--cs-radius-md);
  box-shadow: var(--cs-shadow-md);
  z-index: 20;
}

.title {
  font-size: var(--cs-font-size-xs);
  font-weight: var(--cs-font-weight-bold);
  color: var(--cs-text-muted);
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
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-sm);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.presetActive.presetActive,
.presetActive.presetActive:hover {
  background: var(--cs-primary);
  border-color: var(--cs-primary);
  color: var(--cs-primary-fg);
}

.hints {
  margin: 0 0 var(--cs-spacing-xs);
  padding-left: var(--cs-spacing-md);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
  line-height: 1.5;
}
</style>
