<script setup lang="ts">
import SectionPanel from "./SectionPanel.vue";
import TreeContextMenu from "./TreeContextMenu.vue";
import type { ViewInspectApi } from "@/composables/editor/useViewInspect";

const props = defineProps<{ inspect: ViewInspectApi }>();
</script>

<template>
  <SectionPanel
    v-if="props.inspect.section.active.value"
    :section="props.inspect.section"
    @look-at="props.inspect.lookAtSection()"
  />
  <TreeContextMenu
    v-if="props.inspect.menu.value"
    :x="props.inspect.menu.value.x"
    :y="props.inspect.menu.value.y"
    :items="props.inspect.menu.value.items"
    @close="props.inspect.closeMenu()"
  />
</template>
