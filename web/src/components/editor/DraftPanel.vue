<script setup lang="ts">
import { computed } from "vue";
import CsButton from "@/components/ui/CsButton.vue";
import CsCheckbox from "@/components/ui/CsCheckbox.vue";
import CsIcon from "@/components/ui/CsIcon.vue";
import CsInput from "@/components/ui/CsInput.vue";
import { useDisplayNames } from "@/composables/useDisplayNames";
import { MIRROR_BASE_PLANES } from "@/lib/mirrorPlane";
import { pluralize } from "@/lib/plural";
import PropsPanelShell from "./PropsPanelShell.vue";
import type { DraftApi } from "@/composables/editor/useDraft";

const props = defineProps<{ draft: DraftApi }>();

const names = useDisplayNames();

const usesFace = computed(() => props.draft.neutralSource.value === "face");
const hasFaces = computed(() => props.draft.faceIds.value.length > 0);

const statusText = computed(() => {
  const draft = props.draft;
  if (draft.hint.value) return draft.hint.value;
  if (!draft.bodyId.value) return "Кликните боковые грани, которые нужно наклонить. Повторный клик снимает грань.";
  const faces = pluralize(draft.faceIds.value.length, "грань", "грани", "граней");
  return `${names.bodyLabel(draft.bodyId.value)}: под уклон ${faces}`;
});

const neutralText = computed(() => {
  if (!usesFace.value) return `Плоскость ${props.draft.basePlane.value} через начало координат`;
  if (props.draft.pickingNeutral.value) return "Ждёт клика по плоской грани";
  return props.draft.neutralFace.value ? "Плоская грань тела" : "Грань не выбрана";
});

const BASE_AXES = { XY: "+Z", XZ: "+Y", YZ: "+X" } as const;

const pullText = computed(() => {
  const direction = usesFace.value ? "от нейтральной грани вглубь тела" : `вдоль ${BASE_AXES[props.draft.basePlane.value]}`;
  return `Тело ${props.draft.reverse.value ? "расширяется" : "сужается"} ${direction}`;
});
</script>

<template>
  <PropsPanelShell title="Уклон" kind="FEATURE" dot-color="oklch(0.72 0.14 140)">
    <div :class="$style.body" data-testid="draft-panel">
      <p :class="[$style.status, hasFaces && $style.statusReady]" data-testid="draft-status">{{ statusText }}</p>

      <div :class="$style.field">
        <span :class="$style.label">Нейтральная плоскость</span>
        <div :class="$style.row">
          <CsButton
            v-for="plane in MIRROR_BASE_PLANES"
            :key="plane"
            size="sm"
            :variant="!usesFace && draft.basePlane.value === plane ? 'primary' : 'secondary'"
            :data-testid="`draft-neutral-${plane}`"
            @click="draft.selectBasePlane(plane)"
          >
            {{ plane }}
          </CsButton>
          <CsButton
            size="sm"
            :variant="usesFace ? 'primary' : 'secondary'"
            data-testid="draft-neutral-face"
            @click="draft.startNeutralFacePick"
          >
            Грань
          </CsButton>
        </div>
        <span :class="$style.hint" data-testid="draft-neutral-status">{{ neutralText }}</span>
      </div>

      <div :class="$style.field">
        <span :class="$style.label">Грани под уклон</span>
        <ul v-if="hasFaces" :class="$style.list" data-testid="draft-face-list">
          <li v-for="(row, index) in draft.faceRows.value" :key="String(row.faceId)" :class="$style.item" data-testid="draft-face-row">
            <span :class="$style.index">{{ index + 1 }}</span>
            <span :class="$style.itemLabel">{{ row.label }}</span>
            <CsButton
              variant="ghost"
              size="sm"
              :aria-label="`Снять с выбора: ${row.label}`"
              data-testid="draft-face-remove"
              @click="draft.removeFace(row.faceId)"
            >
              <CsIcon name="close" :size="12" />
            </CsButton>
          </li>
        </ul>
        <CsCheckbox
          :model-value="draft.tangentChain.value"
          label="Касательная цепочка"
          data-testid="draft-tangent-chain"
          @update:model-value="draft.setTangentChain"
        />
      </div>

      <div :class="$style.field">
        <CsInput
          :model-value="draft.angle.text.value"
          label="Угол уклона"
          suffix="°"
          inputmode="decimal"
          title="Больше 0 и меньше 90°. Можно выражение с единицами: 3deg, 0.05 rad"
          :error="draft.angle.error.value ?? undefined"
          data-testid="draft-angle"
          @update:model-value="draft.setAngleText"
          @change="draft.angle.commit"
        />
      </div>

      <div :class="$style.field">
        <span :class="$style.label">Направление вытягивания</span>
        <div :class="$style.row">
          <CsButton
            size="sm"
            :variant="draft.reverse.value ? 'primary' : 'secondary'"
            data-testid="draft-reverse"
            @click="draft.setReverse(!draft.reverse.value)"
          >
            Реверс
          </CsButton>
        </div>
        <span :class="$style.hint" data-testid="draft-pull">{{ pullText }}</span>
      </div>

      <p v-if="draft.error.value" :class="$style.error" data-testid="draft-error">{{ draft.error.value }}</p>
    </div>

    <template #foot>
      <CsButton variant="primary" :disabled="!draft.canApply.value" data-testid="draft-apply" @click="draft.apply">
        {{ draft.loading.value ? "Строю…" : "Применить" }}
      </CsButton>
      <CsButton variant="ghost" :disabled="!hasFaces" data-testid="draft-clear" @click="draft.clear">Сброс</CsButton>
      <CsButton variant="ghost" @click="draft.exit">Закрыть</CsButton>
    </template>
  </PropsPanelShell>
</template>

<style module>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--cs-spacing-md);
  padding: var(--cs-spacing-md);
}

.status {
  margin: 0;
  font-size: var(--cs-font-size-xs);
  line-height: 1.45;
  color: var(--cs-text-muted);
}

.statusReady {
  color: var(--cs-text-secondary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.row {
  display: flex;
  gap: 4px;
}

.hint {
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-muted);
}

.list {
  max-height: 168px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-md);
  background: var(--cs-surface-sunken);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--cs-spacing-sm);
  padding: 0 var(--cs-spacing-xs) 0 var(--cs-spacing-sm);
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.item + .item {
  border-top: 1px solid var(--cs-border-subtle);
}

.index {
  flex-shrink: 0;
  min-width: var(--cs-spacing-md);
  font-family: var(--cs-font-mono);
  color: var(--cs-text-muted);
}

.itemLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error {
  margin: 0;
  font-size: var(--cs-font-size-xs);
  line-height: 1.45;
  color: var(--cs-danger);
}
</style>
