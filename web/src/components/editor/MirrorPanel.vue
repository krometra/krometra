<script setup lang="ts">
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrCheckbox from "@/components/ui/KrCheckbox.vue";
import KrNumberInput from "@/components/ui/KrNumberInput.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { MIRROR_BASE_PLANES } from "@/lib/mirrorPlane";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { MirrorApi } from "@/composables/editor/useMirror";

const props = defineProps<{ mirror: MirrorApi }>();

const names = useDisplayNames();

const usesFace = computed(() => props.mirror.planeSource.value === "face");

const statusText = computed(() => {
  const mirror = props.mirror;
  if (mirror.faceHint.value) return mirror.faceHint.value;
  if (!mirror.bodyId.value) {
    return usesFace.value
      ? "Кликните плоскую грань тела: тело отразится относительно её плоскости"
      : "Кликните тело, которое нужно отразить";
  }
  const body = names.bodyLabel(mirror.bodyId.value);
  if (usesFace.value) return `${body}: отражение относительно выбранной грани — призрак показывает результат`;
  return `${body}: отражение относительно ${mirror.basePlane.value} — призрак показывает результат`;
});
</script>

<template>
  <PropsPanelShell title="Зеркало" kind="FEATURE" dot-color="oklch(0.72 0.12 200)">
    <div :class="$style.body" data-testid="mirror-panel">
      <p :class="[$style.status, mirror.canApply.value && $style.statusReady]" data-testid="mirror-status">
        {{ statusText }}
      </p>

      <div :class="$style.field">
        <span :class="$style.label">Плоскость</span>
        <div :class="$style.planes">
          <KrButton
            v-for="plane in MIRROR_BASE_PLANES"
            :key="plane"
            size="sm"
            :variant="!usesFace && mirror.basePlane.value === plane ? 'primary' : 'secondary'"
            :data-testid="`mirror-plane-${plane}`"
            @click="mirror.selectBasePlane(plane)"
          >
            {{ plane }}
          </KrButton>
          <KrButton
            size="sm"
            :variant="usesFace ? 'primary' : 'secondary'"
            data-testid="mirror-plane-face"
            @click="mirror.selectFacePlane"
          >
            Грань
          </KrButton>
        </div>
      </div>

      <div v-if="!usesFace" :class="$style.field">
        <span :class="$style.label">Смещение плоскости</span>
        <KrNumberInput
          :model-value="mirror.offset.value"
          :step="1"
          suffix="мм"
          data-testid="mirror-offset"
          @update:model-value="mirror.setOffset"
        />
        <span :class="$style.hint">Вдоль оси, перпендикулярной плоскости</span>
      </div>

      <KrCheckbox
        :model-value="mirror.merge.value"
        label="Объединить с исходным телом"
        data-testid="mirror-merge"
        @update:model-value="mirror.setMerge"
      />
      <span :class="$style.hint">
        {{ mirror.merge.value ? "Результат — одно тело из исходного и отражения" : "Результат — новое тело, исходное остаётся" }}
      </span>

      <p v-if="mirror.error.value" :class="$style.error" data-testid="mirror-error">
        {{ mirror.error.value }}
      </p>
    </div>

    <template #foot>
      <KrButton variant="primary" :disabled="!mirror.canApply.value" data-testid="mirror-apply" @click="mirror.apply">
        {{ mirror.loading.value ? "Строю…" : "Применить" }}
      </KrButton>
      <KrButton variant="ghost" @click="mirror.exit">Закрыть</KrButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-md);
  padding: var(--kr-spacing-md);
}

.status {
  margin: 0;
  font-size: var(--kr-font-size-xs);
  line-height: 1.45;
  color: var(--kr-text-muted);
}

.statusReady {
  color: var(--kr-text-secondary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-secondary);
}

.hint {
  font-size: var(--kr-font-size-xs);
  color: var(--kr-text-muted);
}

.planes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.error {
  margin: 0;
  font-size: var(--kr-font-size-xs);
  line-height: 1.45;
  color: var(--kr-danger);
}
</style>
