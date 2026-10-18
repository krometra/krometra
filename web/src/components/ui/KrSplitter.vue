<script setup lang="ts">
import { computed } from "vue";
import * as splitter from "@zag-js/splitter";
import { useMachine, normalizeProps } from "@zag-js/vue";

interface PanelSize {
  id: string;
  size: number;
  minSize?: number;
  maxSize?: number;
}

const props = withDefaults(
  defineProps<{
    direction?: "horizontal" | "vertical";
    defaultSize?: PanelSize[];
  }>(),
  {
    direction: "horizontal",
    defaultSize: () => [],
  }
);

const id = `kr-splitter-${Math.random().toString(36).slice(2, 9)}`;

const [state, send] = useMachine(
  splitter.machine({
    id,
    orientation: props.direction,
    size: props.defaultSize,
  })
);

const api = computed(() =>
  splitter.connect(state.value, send, normalizeProps)
);
</script>

<template>
  <div
    :class="[
      $style.root,
      props.direction === 'vertical' ? $style.vertical : $style.horizontal,
    ]"
    v-bind="api.getRootProps()"
  >
    <slot
      :api="api"
      :panelCount="props.defaultSize.length"
    />
  </div>
</template>

<style module>
.root {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.horizontal {
  flex-direction: row;
}

.vertical {
  flex-direction: column;
}
</style>
