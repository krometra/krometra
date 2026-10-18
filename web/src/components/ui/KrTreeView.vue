<script setup lang="ts">
import { computed, watch } from "vue";
import * as treeView from "@zag-js/tree-view";
import { type TreeNode } from "@zag-js/collection";
import { useMachine, normalizeProps } from "@zag-js/vue";

const props = withDefaults(
  defineProps<{
    nodes?: TreeNode[];
    selectedId?: string;
    expandedIds?: string[];
  }>(),
  {
    nodes: () => [],
    selectedId: "",
    expandedIds: () => [],
  }
);

const emit = defineEmits<{
  "update:selectedId": [value: string];
  "update:expandedIds": [value: string[]];
}>();

const id = `kr-tree-${Math.random().toString(36).slice(2, 9)}`;

function makeCollection(nodes: TreeNode[]) {
  return treeView.collection({
    nodeToValue: (node: TreeNode) => node.id,
    nodeToString: (node: TreeNode) => node.name ?? node.id,
    rootNode: {
      id: "ROOT",
      name: "",
      children: nodes,
    },
  });
}

const [state, send] = useMachine(
  treeView.machine({
    id,
    collection: makeCollection(props.nodes),
    expandedValue: props.expandedIds,
    selectedValue: props.selectedId ? [props.selectedId] : [],
  })
);

const api = computed(() =>
  treeView.connect(state.value, send, normalizeProps)
);

watch(
  () => props.selectedId,
  (val) => {
    const current = api.value.selectedValue;
    if (current?.[0] !== val) {
      api.value.setSelectedValue(val ? [val] : []);
    }
  }
);

watch(
  () => api.value.selectedValue,
  (val) => {
    const sel = val?.[0] ?? "";
    if (sel !== props.selectedId) {
      emit("update:selectedId", sel);
    }
  }
);

watch(
  () => api.value.expandedValue,
  (val) => {
    emit("update:expandedIds", val);
  }
);

watch(
  () => props.nodes,
  () => {
    // Tree collection is immutable; re-created when nodes change via machine restart.
    // Dynamic updates handled by parent through key remount if needed.
  },
  { deep: true }
);
</script>

<template>
  <div :class="$style.root" v-bind="api.getRootProps()">
    <div :class="$style.tree" v-bind="api.getTreeProps()">
      <template
        v-for="node in api.getVisibleNodes()"
        :key="node.id"
      >
        <div
          :class="[
            $style.node,
            node.children && node.children.length > 0 ? $style.hasChildren : '',
            api.selectedValue.includes(node.id) ? $style.selected : '',
          ]"
          v-bind="api.getItemProps({ node: node as any, indexPath: (node as any).indexPath ?? [] })"
          :style="{ paddingLeft: `${(node.depth ?? 0) * 16 + 8}px` }"
        >
          <span
            v-if="node.children && node.children.length > 0"
            :class="$style.chevron"
            @click="api.setExpandedValue(
              api.expandedValue.includes(node.id)
                ? api.expandedValue.filter((id: string) => id !== node.id)
                : [...api.expandedValue, node.id]
            )"
          >
            {{ api.expandedValue.includes(node.id) ? '▾' : '▸' }}
          </span>
          <span v-else :class="$style.chevronPlaceholder" />
          <span :class="$style.label">{{ node.name ?? node.id }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style module>
.root {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.tree {
  padding: var(--kr-spacing-xs) 0;
}

.node {
  display: flex;
  align-items: center;
  gap: var(--kr-spacing-xs);
  padding: var(--kr-spacing-xs) var(--kr-spacing-sm);
  color: var(--kr-text-secondary);
  font-size: var(--kr-font-size-sm);
  cursor: pointer;
  transition: background var(--kr-transition-fast), color var(--kr-transition-fast);
  user-select: none;
}

.node:hover {
  background: var(--kr-surface-hover);
  color: var(--kr-text);
}

.selected {
  color: var(--kr-text);
  background: var(--kr-primary-soft);
}

.chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 10px;
  color: var(--kr-text-muted);
  flex-shrink: 0;
}

.chevronPlaceholder {
  width: 16px;
  flex-shrink: 0;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
