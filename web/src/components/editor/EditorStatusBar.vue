<script setup lang="ts">
import { computed } from "vue";
import { useBrowserKernelStatus } from "@/composables/editor/browserKernelStatus";
import { kernelPhaseLabel } from "@/lib/browserKernel";
import { pluralize } from "@/lib/plural";

defineProps<{
  lastOpMs: number | null;
  operationCount: number;
}>();

const kernel = useBrowserKernelStatus();
const kernelLabel = computed(() => kernelPhaseLabel(kernel.phase.value, kernel.heapBytes.value));
const kernelTitle = computed(() => kernel.failure.value ?? `Тел в ядре: ${kernel.bodyCount.value}`);
</script>

<template>
  <div :class="$style.statusBar">
    <span :class="$style.kernel" :title="kernelTitle" data-testid="kernel-status">
      <span :class="[$style.statusDot, $style[kernel.phase.value]]" />{{ kernelLabel }}
    </span>
    <span>OCCT/WASM</span>
    <span>мм · градусы</span>
    <span :class="$style.statusSpacer">пересчёт: {{ lastOpMs === null ? "—" : lastOpMs }} мс</span>
    <span>{{ pluralize(operationCount, "операция", "операции", "операций") }}</span>
  </div>
</template>

<style module>
.statusBar {
  height: 26px;
  flex-shrink: 0;
  border-top: 1px solid var(--cs-border-subtle);
  background: var(--cs-surface);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 18px;
  font-family: var(--cs-font-mono);
  font-size: 11px;
  color: var(--cs-text-muted);
}

.kernel {
  display: flex;
  align-items: center;
  gap: 6px;
}

.statusDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cs-text-muted);
}

.ready {
  background: var(--cs-green);
}

.loading,
.restarting {
  background: var(--cs-amber);
  animation: pulse 1s ease-in-out infinite;
}

.failed {
  background: var(--cs-error);
}

.statusSpacer {
  margin-left: auto;
}

@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}
</style>
