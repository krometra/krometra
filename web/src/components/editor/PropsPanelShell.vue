<script setup lang="ts">
defineProps<{
  title: string;
  kind: string;
  dotColor: string;
}>();
</script>

<template>
  <div :class="$style.propsHead">
    <span :class="$style.dot" :style="{ background: dotColor }" />
    <span :class="$style.propsTitle">{{ title }}</span>
    <span :class="$style.propsKind">{{ kind }}</span>
  </div>
  <div :class="$style.propsBody">
    <slot />
  </div>
  <div v-if="$slots.foot" :class="$style.propsFoot">
    <slot name="foot" />
  </div>
</template>

<style module>
.propsHead {
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 14px;
  border-bottom: 1px solid var(--cs-border-subtle);
}

.dot {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  border-radius: 3px;
}

.propsTitle {
  font-size: 13px;
  font-weight: var(--cs-font-weight-bold);
}

.propsKind {
  margin-left: auto;
  font-family: var(--cs-font-mono);
  font-size: 10px;
  color: var(--cs-text-muted);
}

.propsBody {
  flex: 1;
  overflow: auto;
  padding: 16px 14px;
}

.propsFoot {
  border-top: 1px solid var(--cs-border-subtle);
  padding: 12px 14px;
  display: flex;
  gap: 8px;
}
</style>
